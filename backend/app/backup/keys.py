"""The backup encryption key.

Backups are encrypted to an age X25519 public key, not directly with the
admin's passphrase. The private half is stored only in passphrase-encrypted
form ("wrapped"), so:

- scheduled backups need no passphrase, and the server never stores one;
- someone who takes over the server cannot decrypt backups already sent
  off-site;
- the wrapped key is a standard age file, so a backup can be restored on any
  machine with the stock `age` tool and the passphrase, without ECTLogger:
      age -d -i ectlogger-backup-key-<fp>.age ectlogger-<date>.tar.gz.age

age's passphrase mode only encrypts in memory, which is fine for a key of a
few hundred bytes and would not be for a backup; the public-key mode used for
the backups themselves streams.
"""
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone

from pyrage import DecryptError, passphrase as age_passphrase, x25519

MIN_PASSPHRASE_LENGTH = 12


class BadPassphrase(Exception):
    """The passphrase does not unlock the stored backup key."""


@dataclass
class BackupKey:
    recipient: str        # age1... public key, used to encrypt every backup
    wrapped_identity: bytes  # age file: the private key, encrypted with the passphrase
    fingerprint: str      # short id shown in the admin panel and in the key file's name


def fingerprint_of(recipient: str) -> str:
    return hashlib.sha256(recipient.encode()).hexdigest()[:8]


def key_filename(fingerprint: str) -> str:
    return f"ectlogger-backup-key-{fingerprint}.age"


def validate_passphrase(value: str) -> None:
    if len(value or "") < MIN_PASSPHRASE_LENGTH:
        raise ValueError(f"The passphrase must be at least {MIN_PASSPHRASE_LENGTH} characters.")


def generate_key(passphrase: str) -> BackupKey:
    validate_passphrase(passphrase)
    identity = x25519.Identity.generate()
    recipient = str(identity.to_public())
    return BackupKey(
        recipient=recipient,
        wrapped_identity=_wrap(str(identity), recipient, passphrase),
        fingerprint=fingerprint_of(recipient),
    )


def unwrap_identity(wrapped_identity: bytes, passphrase: str) -> x25519.Identity:
    try:
        text = age_passphrase.decrypt(wrapped_identity, passphrase).decode()
    except DecryptError as exc:
        raise BadPassphrase("That passphrase does not unlock the backup key.") from exc
    secret = next(line for line in text.splitlines() if line.startswith("AGE-SECRET-KEY-"))
    return x25519.Identity.from_str(secret)


def rewrap(wrapped_identity: bytes, old_passphrase: str, new_passphrase: str) -> bytes:
    """Same key, new passphrase. Earlier backups stay readable with the new one."""
    validate_passphrase(new_passphrase)
    identity = unwrap_identity(wrapped_identity, old_passphrase)
    return _wrap(str(identity), str(identity.to_public()), new_passphrase)


def _wrap(secret: str, recipient: str, passphrase: str) -> bytes:
    # Comment lines are part of age's identity file format, so the stock tool
    # reads this file as-is once it has decrypted it.
    created = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    text = (
        "# ECTLogger backup key\n"
        f"# created: {created}\n"
        f"# public key: {recipient}\n"
        f"{secret}\n"
    )
    return age_passphrase.encrypt(text.encode(), passphrase)
