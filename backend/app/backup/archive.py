"""Building, checking and unpacking one backup file.

A backup is a single file, ``ectlogger-YYYYMMDD-HHMMSS.tar.gz.age``: a gzipped
tar, encrypted to the instance's backup key (see keys.py). Inside:

    manifest.json               what is in it, with a SHA-256 per file
    database/ectlogger.db       SQLite snapshot   (or database/database.sql for PostgreSQL)
    data/...                    uploaded files: avatars, chat images, logos
    config/backend.env          backend/.env  (SECRET_KEY, SMTP, ...)
    config/frontend.env         frontend/.env

The plaintext tar only ever exists inside a private staging folder next to the
finished backups, and is deleted before this module returns.
"""
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pyrage
from pyrage import x25519

from app.backup import paths

FORMAT_VERSION = 1
BACKUP_NAME_RE = re.compile(r"^ectlogger-(\d{8})-(\d{6})\.tar\.gz\.age$")
# Scratch folders. All hold plaintext while they exist: a backup being built
# or one decrypted to be checked (both beside the backups), or one unpacked
# for a restore (in backend/).
STAGING_PREFIX = ".staging-"
VERIFY_PREFIX = ".verify-"
RESTORE_PREFIX = ".restore-"
SCRATCH_PREFIXES = (STAGING_PREFIX, VERIFY_PREFIX, RESTORE_PREFIX)
# A folder older than this was left by a process that was killed, since no
# build or check runs anywhere near this long.
STALE_SCRATCH_SECONDS = 3600
MANIFEST_NAME = "manifest.json"


class BackupError(Exception):
    """A backup or restore step failed in a way worth showing an admin verbatim."""


@dataclass
class BuiltBackup:
    path: Path
    size_bytes: int
    sha256: str
    manifest: dict


@dataclass
class VerifyResult:
    ok: bool
    problems: list = field(default_factory=list)
    # Restorable, but something a restore should say out loud (a SECRET_KEY
    # that does not open the two-factor secrets). "Check this backup" treats
    # these as failures; restore prints them and carries on.
    warnings: list = field(default_factory=list)
    manifest: Optional[dict] = None
    # What the backup holds, for the report: users, nets, check_ins,
    # uploaded_files, and mfa_secrets (how many the backup's SECRET_KEY opened).
    summary: dict = field(default_factory=dict)


def backup_filename(when: datetime) -> str:
    return f"ectlogger-{when.astimezone(timezone.utc):%Y%m%d-%H%M%S}.tar.gz.age"


def parse_backup_time(name: str) -> Optional[datetime]:
    match = BACKUP_NAME_RE.match(name)
    if not match:
        return None
    return datetime.strptime("".join(match.groups()), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)


# ========== BUILD ==========

def build_backup(recipient: str, key_fingerprint: str, out_dir: Optional[Path] = None,
                 now: Optional[datetime] = None) -> BuiltBackup:
    """Snapshot the database and uploaded files into one encrypted file."""
    out_dir = paths.ensure_private_dir(out_dir or paths.backup_dir())
    now = now or datetime.now(timezone.utc)
    final_path = out_dir / backup_filename(now)

    staging = Path(tempfile.mkdtemp(prefix=STAGING_PREFIX, dir=out_dir))
    try:
        tree = staging / "tree"
        tree.mkdir()

        db_kind = _snapshot_database(tree / "database")
        if paths.DATA_DIR.is_dir():
            shutil.copytree(paths.DATA_DIR, tree / "data", symlinks=False)
        (tree / "config").mkdir()
        for name, source in paths.ENV_FILES.items():
            if source.is_file():
                shutil.copy2(source, tree / "config" / name)

        manifest = {
            "format_version": FORMAT_VERSION,
            "created_at": now.isoformat(),
            "database": db_kind,
            "git_commit": _git_commit(),
            "latest_migration": latest_migration(),
            "key_fingerprint": key_fingerprint,
            "files": _checksums(tree),
        }
        (tree / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2))

        plain = staging / "backup.tar.gz"
        with tarfile.open(plain, "w:gz") as tar:
            # Manifest first, so a reader can check what follows as it goes.
            tar.add(tree / MANIFEST_NAME, arcname=MANIFEST_NAME)
            for child in sorted(tree.iterdir()):
                if child.name != MANIFEST_NAME:
                    tar.add(child, arcname=child.name)

        partial = final_path.with_name(final_path.name + ".partial")
        with open(plain, "rb") as reader, open(partial, "wb") as writer:
            pyrage.encrypt_io(reader, writer, [x25519.Recipient.from_str(recipient)])
        os.chmod(partial, 0o600)
        partial.rename(final_path)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    return BuiltBackup(
        path=final_path,
        size_bytes=final_path.stat().st_size,
        sha256=file_sha256(final_path),
        manifest=manifest,
    )


def _snapshot_database(dest: Path) -> str:
    dest.mkdir()
    db_path = paths.sqlite_db_path()
    if db_path is not None:
        if not db_path.is_file():
            raise BackupError(f"Database file not found: {db_path}")
        snapshot = dest / "ectlogger.db"
        # SQLite's online backup copies a consistent state even while the
        # service is writing. A plain file copy can catch a half-written page.
        source = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        target = sqlite3.connect(snapshot)
        try:
            source.backup(target)
        finally:
            source.close()
            target.close()
        problem = sqlite_integrity_problem(snapshot)
        if problem:
            raise BackupError(f"The database failed SQLite's integrity check: {problem}")
        return "sqlite"

    from app.config import settings  # lazy: restore imports this module before a .env exists

    url = settings.database_url
    if url.startswith("postgresql"):
        plain_url = re.sub(r"^postgresql\+\w+://", "postgresql://", url)
        _run_dump(["pg_dump", "--no-owner", "--no-privileges", "--dbname", plain_url],
                  dest / "database.sql", "pg_dump")
        return "postgresql"
    raise BackupError(
        "Built-in backups support SQLite and PostgreSQL. For this database, "
        "back it up with its own tools and set BACKUP_SCHEDULER=off."
    )


def _run_dump(command: list, out_file: Path, tool: str) -> None:
    try:
        with open(out_file, "wb") as out:
            result = subprocess.run(command, stdout=out, stderr=subprocess.PIPE, timeout=3600)
    except FileNotFoundError:
        raise BackupError(f"{tool} is not installed on this server.")
    if result.returncode != 0:
        raise BackupError(f"{tool} failed: {result.stderr.decode(errors='replace').strip()[:500]}")


def sqlite_integrity_problem(db_file: Path) -> Optional[str]:
    """None when the file passes PRAGMA integrity_check, else the first complaint."""
    try:
        conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
        try:
            row = conn.execute("PRAGMA integrity_check").fetchone()
        finally:
            conn.close()
    except sqlite3.DatabaseError as exc:
        return str(exc)
    return None if row and row[0] == "ok" else (row[0] if row else "no result")


def _check_restored_data(db_file: Path, env_file: Path) -> tuple[dict, Optional[str]]:
    """Count what the backup holds, and check that the SECRET_KEY it carries
    opens every two-factor secret in it.

    That second check is the one a restore would otherwise fail silently: the
    database comes back fine, but if its SECRET_KEY is not the one the secrets
    were encrypted with, every admin is locked out of two-factor sign-in.
    """
    from dotenv import dotenv_values
    from cryptography.fernet import InvalidToken
    from app.derived_keys import MFA_SECRET_PURPOSE, fernet_from_secret

    conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
    try:
        counts = {table: conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                  for table in ("users", "nets", "check_ins")}
        secrets = [row[0] for row in conn.execute(
            "SELECT mfa_secret_encrypted FROM users WHERE mfa_enabled = 1 AND mfa_secret_encrypted IS NOT NULL")]
    finally:
        conn.close()
    if not secrets:
        return counts, None
    secret_key = dotenv_values(env_file).get("SECRET_KEY") if env_file.is_file() else None
    if not secret_key:
        return counts, (f"The backup has no SECRET_KEY, so its {len(secrets)} two-factor "
                        f"secret(s) could only be opened with this server's own.")
    fernet = fernet_from_secret(secret_key, MFA_SECRET_PURPOSE)
    opened = 0
    for token in secrets:
        try:
            fernet.decrypt(token.encode())
            opened += 1
        except InvalidToken:
            pass
    counts["mfa_secrets"] = opened
    if opened < len(secrets):
        return counts, (f"The backup's SECRET_KEY opens only {opened} of {len(secrets)} two-factor "
                        f"secrets; restored as it is, those accounts could not sign in with two-factor.")
    return counts, None


def describe(result: VerifyResult) -> str:
    """One report for a checked backup, shared by the command line and the admin panel."""
    if not result.ok:
        return "\n".join(result.problems)
    s = result.summary
    lines = ["Every file matches its checksum and the database is intact."]
    if "users" in s:
        lines.append(f"Holds {s['users']:,} users, {s['nets']:,} nets, {s['check_ins']:,} check-ins "
                     f"and {s['uploaded_files']:,} uploaded files.")
    else:
        lines.append(f"Holds {s.get('uploaded_files', 0):,} uploaded files.")
    if result.warnings:
        lines = [f"Warning: {w}" for w in result.warnings] + lines
    elif s.get("mfa_secrets"):
        lines.append(f"Its SECRET_KEY opens all {s['mfa_secrets']} two-factor secrets.")
    return "\n".join(lines)


def passed(result: VerifyResult) -> bool:
    """What "Check this backup" reports: no problems and nothing to warn about."""
    return result.ok and not result.warnings


def remove_stale_scratch(directory: Path, now: Optional[float] = None) -> list[str]:
    """Delete scratch folders a killed process left behind; returns their names.

    Normal runs remove their own on the way out, even after an error. Only a
    process killed outright (out of memory, a reboot, Ctrl-C twice during a
    restore) leaves one, and then it holds a decrypted database until
    something removes it. The age limit
    keeps this from pulling a folder out from under a check still running.
    """
    if not directory.is_dir():
        return []
    now = now if now is not None else time.time()
    removed = []
    for entry in directory.iterdir():
        if (entry.is_dir() and entry.name.startswith(SCRATCH_PREFIXES)
                and now - entry.stat().st_mtime > STALE_SCRATCH_SECONDS):
            shutil.rmtree(entry, ignore_errors=True)
            removed.append(entry.name)
    return removed


def _checksums(tree: Path) -> dict:
    return {
        str(path.relative_to(tree)): {"size": path.stat().st_size, "sha256": file_sha256(path)}
        for path in sorted(tree.rglob("*"))
        if path.is_file()
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_commit() -> Optional[str]:
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=paths.REPO_DIR,
                                capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return None
        return result.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def latest_migration() -> Optional[int]:
    """Highest numbered script in backend/migrations -- what this code expects."""
    numbers = [int(m.group(1)) for p in (paths.BACKEND_DIR / "migrations").glob("*.py")
               if (m := re.match(r"^(\d+)_", p.name))]
    return max(numbers) if numbers else None


# ========== READ BACK ==========

def decrypt_to(path: Path, identity: x25519.Identity, dest: Path) -> None:
    try:
        with open(path, "rb") as reader, open(dest, "wb") as writer:
            pyrage.decrypt_io(reader, writer, [identity])
    except pyrage.DecryptError as exc:
        raise BackupError("This backup was not made with this backup key.") from exc


def unpack(path: Path, identity: x25519.Identity, dest: Path) -> dict:
    """Decrypt and extract a backup into ``dest``; returns its manifest."""
    dest.mkdir(parents=True, exist_ok=True)
    plain = dest / ".backup.tar.gz"
    try:
        decrypt_to(path, identity, plain)
        with tarfile.open(plain, "r:gz") as tar:
            members = tar.getmembers()
            for member in members:
                _check_member(member)
            tar.extractall(dest, members=members)
    finally:
        plain.unlink(missing_ok=True)
    manifest_file = dest / MANIFEST_NAME
    if not manifest_file.is_file():
        raise BackupError("This file has no manifest; it is not an ECTLogger backup.")
    return json.loads(manifest_file.read_text())


def _check_member(member: tarfile.TarInfo) -> None:
    # Python 3.11.2 (production) predates tarfile's extraction filters, so
    # refuse anything that could land outside the destination by hand.
    name = Path(member.name)
    if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir()):
        raise BackupError(f"Refusing unsafe entry in backup: {member.name}")


def verify(path: Path, identity: x25519.Identity) -> VerifyResult:
    """Decrypt a backup into a scratch folder and check every file against its manifest."""
    scratch = Path(tempfile.mkdtemp(prefix=VERIFY_PREFIX, dir=path.parent))
    try:
        try:
            manifest = unpack(path, identity, scratch)
        except (BackupError, tarfile.TarError, OSError) as exc:
            return VerifyResult(ok=False, problems=[str(exc)])

        problems, warnings = [], []
        for rel, expected in manifest.get("files", {}).items():
            actual = scratch / rel
            if not actual.is_file():
                problems.append(f"Missing: {rel}")
            elif file_sha256(actual) != expected["sha256"]:
                problems.append(f"Checksum mismatch: {rel}")
        summary = {"uploaded_files": sum(1 for rel in manifest.get("files", {}) if rel.startswith("data/"))}
        if manifest.get("database") == "sqlite":
            db_file = scratch / "database" / "ectlogger.db"
            problem = sqlite_integrity_problem(db_file)
            if problem:
                problems.append(f"Database integrity check: {problem}")
            else:
                try:
                    counts, mfa_problem = _check_restored_data(db_file, scratch / "config" / "backend.env")
                except sqlite3.Error as exc:
                    problems.append(f"Could not read the backed-up database: {exc}")
                else:
                    summary.update(counts)
                    if mfa_problem:
                        warnings.append(mfa_problem)
        return VerifyResult(ok=not problems, problems=problems, warnings=warnings,
                            manifest=manifest, summary=summary)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
