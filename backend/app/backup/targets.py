"""Off-site copies: SFTP servers and S3-compatible object storage.

Every file sent is already encrypted (see archive.py), so a target only ever
holds ciphertext plus the passphrase-wrapped key file.

SFTP host keys are pinned. The first "Test connection" reports the server's
key and fingerprint; nothing is uploaded until an admin has trusted it, and a
changed key afterwards is refused rather than silently accepted.
"""
import base64
import hashlib
import io
import json
import posixpath
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.auth import fernet_for_purpose
from app.backup.archive import BACKUP_NAME_RE

_TARGET_SECRET_PURPOSE = b"ectlogger-backup-target-secret-v1"
KINDS = ("sftp", "s3")
CONNECT_TIMEOUT = 20


class TargetError(Exception):
    """A target could not be reached or refused an operation."""


class UntrustedHostKey(TargetError):
    def __init__(self, host_key: str, fingerprint: str, changed: bool):
        self.host_key = host_key
        self.fingerprint = fingerprint
        self.changed = changed
        if changed:
            message = (f"The server's host key has CHANGED (now {fingerprint}). "
                       "Nothing was sent. Confirm the change with whoever runs that server "
                       "before trusting the new key.")
        else:
            message = f"Not trusted yet. The server's host key is {fingerprint}."
        super().__init__(message)


# ========== SECRETS ==========

def encrypt_secret(value: str) -> str:
    return fernet_for_purpose(_TARGET_SECRET_PURPOSE).encrypt(value.encode()).decode()


def decrypt_secret(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        return fernet_for_purpose(_TARGET_SECRET_PURPOSE).decrypt(token.encode()).decode()
    except Exception:
        return None


def generate_ssh_keypair(comment: str) -> tuple[str, str]:
    """(OpenSSH private key PEM, one-line public key) for an SFTP target."""
    key = Ed25519PrivateKey.generate()
    private = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.OpenSSH,
        serialization.NoEncryption(),
    ).decode()
    public = key.public_key().public_bytes(
        serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH,
    ).decode()
    return private, f"{public} {comment}"


def public_key_of(private_pem: str) -> str:
    key = serialization.load_ssh_private_key(private_pem.encode(), password=None)
    return key.public_key().public_bytes(
        serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH,
    ).decode()


def host_key_fingerprint(host_key: str) -> str:
    """OpenSSH-style SHA256:... fingerprint of a "type base64" host key line."""
    blob = base64.b64decode(host_key.split()[1])
    return "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")


# ========== TARGET INTERFACE ==========

class Target(Protocol):
    def upload(self, local_path: Path, remote_name: str) -> None: ...
    def list_backups(self) -> list[str]: ...
    def delete(self, remote_name: str) -> None: ...
    def check(self) -> str: ...
    def close(self) -> None: ...


def is_backup_name(name: str) -> bool:
    return bool(BACKUP_NAME_RE.match(name))


# ========== SFTP ==========

@dataclass
class SftpConfig:
    host: str
    port: int
    username: str
    path: str


class SftpTarget:
    def __init__(self, config: SftpConfig, private_key_pem: str, trusted_host_key: Optional[str]):
        self.config = config
        self.private_key_pem = private_key_pem
        self.trusted_host_key = trusted_host_key
        self._client = None
        self._sftp = None

    def _connect(self):
        if self._sftp is not None:
            return self._sftp
        import paramiko

        try:
            # Our own socket, so an unreachable host fails after
            # CONNECT_TIMEOUT instead of the operating system's minutes.
            sock = socket.create_connection((self.config.host, self.config.port), timeout=CONNECT_TIMEOUT)
            transport = paramiko.Transport(sock)
        except (paramiko.SSHException, OSError) as exc:
            raise TargetError(f"Could not connect to {self.config.host}:{self.config.port}: {exc}") from exc
        transport.banner_timeout = CONNECT_TIMEOUT
        try:
            transport.start_client(timeout=CONNECT_TIMEOUT)
            remote = transport.get_remote_server_key()
            offered = f"{remote.get_name()} {remote.get_base64()}"
            if offered != (self.trusted_host_key or "").strip():
                raise UntrustedHostKey(offered, host_key_fingerprint(offered),
                                       changed=bool(self.trusted_host_key))
            pkey = paramiko.Ed25519Key.from_private_key(io.StringIO(self.private_key_pem))
            transport.auth_publickey(self.config.username, pkey)
            self._sftp = paramiko.SFTPClient.from_transport(transport)
            self._client = transport
            return self._sftp
        except UntrustedHostKey:
            transport.close()
            raise
        except paramiko.AuthenticationException as exc:
            transport.close()
            raise TargetError("The server refused this target's key. Check that its public "
                              "key is in the SFTP user's authorized keys.") from exc
        except (paramiko.SSHException, OSError) as exc:
            transport.close()
            raise TargetError(f"Could not connect to {self.config.host}:{self.config.port}: {exc}") from exc

    def _remote(self, name: str) -> str:
        return posixpath.join(self.config.path or ".", name)

    def upload(self, local_path: Path, remote_name: str) -> None:
        sftp = self._connect()
        final = self._remote(remote_name)
        partial = final + ".partial"
        try:
            sftp.put(str(local_path), partial, confirm=True)
            try:
                sftp.posix_rename(partial, final)
            except IOError:
                # Servers without the posix-rename extension: plain rename
                # refuses to overwrite, so clear the old copy first.
                try:
                    sftp.remove(final)
                except IOError:
                    pass
                sftp.rename(partial, final)
        except IOError as exc:
            raise TargetError(f"Upload of {remote_name} failed: {exc}") from exc

    def list_backups(self) -> list[str]:
        try:
            return [n for n in self._connect().listdir(self.config.path or ".") if is_backup_name(n)]
        except IOError as exc:
            raise TargetError(f"Could not list {self.config.path}: {exc}") from exc

    def delete(self, remote_name: str) -> None:
        self._connect().remove(self._remote(remote_name))

    def check(self) -> str:
        sftp = self._connect()
        try:
            sftp.listdir(self.config.path or ".")
        except IOError as exc:
            raise TargetError(f"Connected, but cannot open {self.config.path}: {exc}") from exc
        return f"Connected to {self.config.host} and opened {self.config.path}."

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
        self._client = self._sftp = None


# ========== S3-COMPATIBLE ==========

@dataclass
class S3Config:
    endpoint_url: Optional[str]  # None = AWS; else Backblaze B2, Wasabi, MinIO, ...
    region: Optional[str]
    bucket: str
    prefix: str
    access_key_id: str


class S3Target:
    def __init__(self, config: S3Config, secret_access_key: str):
        import boto3
        from botocore.config import Config

        self.config = config
        self.prefix = config.prefix.strip("/")
        self.client = boto3.client(
            "s3",
            endpoint_url=config.endpoint_url or None,
            region_name=config.region or None,
            aws_access_key_id=config.access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(connect_timeout=CONNECT_TIMEOUT, retries={"max_attempts": 3}),
        )

    def _key(self, name: str) -> str:
        return f"{self.prefix}/{name}" if self.prefix else name

    def _wrap(self, action: str, exc: Exception) -> TargetError:
        return TargetError(f"{action} failed on bucket {self.config.bucket}: {exc}")

    def upload(self, local_path: Path, remote_name: str) -> None:
        try:
            self.client.upload_file(str(local_path), self.config.bucket, self._key(remote_name))
        except Exception as exc:
            raise self._wrap(f"Upload of {remote_name}", exc) from exc

    def list_backups(self) -> list[str]:
        names = []
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            prefix = f"{self.prefix}/" if self.prefix else ""
            for page in paginator.paginate(Bucket=self.config.bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    name = obj["Key"][len(prefix):]
                    if "/" not in name and is_backup_name(name):
                        names.append(name)
        except Exception as exc:
            raise self._wrap("Listing", exc) from exc
        return names

    def delete(self, remote_name: str) -> None:
        try:
            self.client.delete_object(Bucket=self.config.bucket, Key=self._key(remote_name))
        except Exception as exc:
            raise self._wrap(f"Deleting {remote_name}", exc) from exc

    def check(self) -> str:
        try:
            self.client.list_objects_v2(Bucket=self.config.bucket, MaxKeys=1)
        except Exception as exc:
            raise self._wrap("Connecting", exc) from exc
        return f"Connected to bucket {self.config.bucket}."

    def close(self) -> None:
        pass


# ========== FROM A STORED ROW ==========

def open_target(kind: str, config_json: str, secret_encrypted: Optional[str],
                trusted_host_key: Optional[str]) -> Target:
    config = json.loads(config_json or "{}")
    secret = decrypt_secret(secret_encrypted)
    if not secret:
        raise TargetError("This target's stored credentials cannot be read. Re-enter them.")
    if kind == "sftp":
        return SftpTarget(
            SftpConfig(host=config["host"], port=int(config.get("port") or 22),
                       username=config["username"], path=config.get("path") or "."),
            private_key_pem=secret, trusted_host_key=trusted_host_key,
        )
    if kind == "s3":
        return S3Target(
            S3Config(endpoint_url=config.get("endpoint_url"), region=config.get("region"),
                     bucket=config["bucket"], prefix=config.get("prefix") or "",
                     access_key_id=config["access_key_id"]),
            secret_access_key=secret,
        )
    raise TargetError(f"Unknown target type: {kind}")
