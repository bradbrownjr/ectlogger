"""Running a backup end to end, and deciding when to.

These run in a separate process (scripts/backup.py), never inside the web
service: building and uploading an archive is slow, blocking work that
must not stall live nets. The web service starts that process for "Back up
now" and, with BACKUP_SCHEDULER=internal, for the schedule too.
"""
import base64
import fcntl
import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.backup import archive, keys, paths, retention, schedule
from app.backup.targets import TargetError, open_target
from app.email_service import EmailService
from app.logger import logger
from app.models import BackupRun, BackupSettings, BackupTarget, User, UserRole

LOCK_NAME = ".backup.lock"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands timestamps back naive; they were written as UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def describe_time(value: Optional[datetime]) -> Optional[str]:
    return as_utc(value).strftime("%Y-%m-%d %H:%M UTC") if value else None


# ========== SHARED LOOKUPS ==========

async def get_settings(db: AsyncSession) -> BackupSettings:
    row = await db.get(BackupSettings, 1)
    if row is None:
        row = BackupSettings(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def admin_emails(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(User.email).where(User.role == UserRole.ADMIN, User.is_active == True)  # noqa: E712
    )
    return [email for email in result.scalars().all() if email]


async def last_run(db: AsyncSession, status: Optional[str] = None) -> Optional[BackupRun]:
    query = select(BackupRun).order_by(BackupRun.started_at.desc(), BackupRun.id.desc()).limit(1)
    if status:
        query = query.where(BackupRun.status == status)
    return (await db.execute(query)).scalar_one_or_none()


def local_backups(directory: Optional[Path] = None) -> list[Path]:
    directory = directory or paths.backup_dir()
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.is_file() and archive.parse_backup_time(p.name))


def key_file_path(fingerprint: str) -> Path:
    return paths.backup_dir() / keys.key_filename(fingerprint)


def write_key_file(settings_row: BackupSettings) -> Path:
    """Keep the wrapped key beside the backups it opens. It is useless
    without the passphrase, and without it the backups are useless too."""
    path = key_file_path(settings_row.key_fingerprint)
    paths.ensure_private_dir(path.parent)
    data = base64.b64decode(settings_row.key_wrapped_identity)
    if not path.is_file() or path.read_bytes() != data:
        path.write_bytes(data)
        os.chmod(path, 0o600)
    return path


@contextmanager
def backup_lock(wait_seconds: float = 0):
    """Yields True when this process holds the lock, False when another
    backup is already running (a cron tick and "Back up now" overlapping).

    A backup waits a few seconds for it, because the admin panel's "is one
    running?" probe takes the same lock for an instant.
    """
    directory = paths.ensure_private_dir(paths.backup_dir())
    handle = open(directory / LOCK_NAME, "w")
    try:
        deadline = time.monotonic() + wait_seconds
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    yield False
                    return
                time.sleep(0.2)
        try:
            yield True
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
    finally:
        handle.close()


def set_passphrase(settings_row: BackupSettings, passphrase: str,
                   current_passphrase: Optional[str] = None, replace: bool = False) -> str:
    """Create the key, change its passphrase, or replace it; returns what was
    done. The passphrase is used and discarded, never stored. Raises
    keys.BadPassphrase or ValueError. Slow on purpose (scrypt): call it off
    the event loop. Shared by the admin panel and `backup.py set-passphrase`.
    """
    if settings_row.key_recipient and not replace:
        if not current_passphrase:
            raise ValueError("Enter the current passphrase to change it.")
        wrapped = keys.rewrap(base64.b64decode(settings_row.key_wrapped_identity),
                              current_passphrase, passphrase)
        settings_row.key_wrapped_identity = base64.b64encode(wrapped).decode()
        return "changed the backup passphrase"
    new_key = keys.generate_key(passphrase)
    settings_row.key_recipient = new_key.recipient
    settings_row.key_wrapped_identity = base64.b64encode(new_key.wrapped_identity).decode()
    settings_row.key_fingerprint = new_key.fingerprint
    settings_row.key_created_at = utcnow()
    return "replaced the backup key" if replace else "created the backup key"


def backup_in_progress() -> bool:
    """True while some process holds the backup lock. A row left saying
    "running" by a process that was killed does not count."""
    with backup_lock() as acquired:
        return not acquired


# ========== RUN ONE BACKUP ==========

async def run_backup(db: AsyncSession, trigger: str, user_id: Optional[int] = None) -> Optional[BackupRun]:
    """Build, copy off-site, prune. Returns the run, or None if another
    backup was already in progress."""
    with backup_lock(wait_seconds=5) as acquired:
        if not acquired:
            logger.info("BACKUP", "Another backup is already running; skipping.")
            return None
        return await _run_locked(db, trigger, user_id)


async def _run_locked(db: AsyncSession, trigger: str, user_id: Optional[int]) -> BackupRun:
    # Holding the lock means any row still marked running belongs to a
    # process that died mid-backup.
    await db.execute(
        update(BackupRun).where(BackupRun.status == "running")
        .values(status="failed", finished_at=utcnow(), error="Interrupted before it finished.")
    )
    settings_row = await get_settings(db)
    run = BackupRun(trigger=trigger, triggered_by_id=user_id, status="running", started_at=utcnow())
    db.add(run)
    await db.commit()
    await db.refresh(run)

    try:
        if not settings_row.key_recipient:
            raise archive.BackupError("No backup passphrase has been set, so there is no key to encrypt with.")
        built = archive.build_backup(settings_row.key_recipient, settings_row.key_fingerprint)
        run.filename = built.path.name
        run.size_bytes = built.size_bytes
        run.sha256 = built.sha256
        run.key_fingerprint = settings_row.key_fingerprint
        await db.commit()

        key_path = write_key_file(settings_row)
        prune_local(settings_row)
        results = await _copy_to_targets(db, built.path, key_path, settings_row)
        run.target_results = json.dumps(results)
        run.status = "success" if all(r["ok"] for r in results) else "partial"
    except Exception as exc:  # every failure lands in the history and the alert
        logger.error("BACKUP", f"Backup failed: {exc}")
        run.status = "failed"
        run.error = str(exc) or exc.__class__.__name__
    run.finished_at = utcnow()
    if run.status == "success":
        settings_row.overdue_alert_sent_at = None
    await db.commit()

    if run.status != "success" and settings_row.notify_on_failure:
        await EmailService.send_backup_failed(
            await admin_emails(db), run.status, describe_time(run.started_at), failure_detail(run),
        )
    logger.info("BACKUP", f"Backup {run.status}: {run.filename or '-'}")
    return run


def failure_detail(run: BackupRun) -> str:
    if run.error:
        return run.error
    lines = [f"{r['name']}: {r['message']}" for r in json.loads(run.target_results or "[]") if not r["ok"]]
    return "\n".join(lines)


def prune_local(settings_row: BackupSettings) -> list[str]:
    files = local_backups()
    keep = retention.select_to_keep(
        [(p.name, archive.parse_backup_time(p.name)) for p in files],
        settings_row.keep_daily, settings_row.keep_weekly, settings_row.keep_monthly,
    )
    removed = []
    for path in files:
        if path.name not in keep:
            path.unlink(missing_ok=True)
            removed.append(path.name)
    return removed


async def _copy_to_targets(db: AsyncSession, backup_path: Path, key_path: Path,
                           settings_row: BackupSettings) -> list[dict]:
    targets = (await db.execute(
        select(BackupTarget).where(BackupTarget.enabled == True).order_by(BackupTarget.id)  # noqa: E712
    )).scalars().all()
    results = []
    for target_row in targets:
        result = {"target_id": target_row.id, "name": target_row.name, "ok": False}
        target = None
        try:
            target = open_target(target_row.kind, target_row.config_json,
                                 target_row.secret_encrypted, target_row.trusted_host_key)
            target.upload(key_path, key_path.name)
            target.upload(backup_path, backup_path.name)
            message = "Copied."
            if target_row.prune_enabled:
                removed = prune_remote(target, settings_row)
                if removed:
                    message += f" Removed {len(removed)} old backup(s)."
            result.update(ok=True, message=message)
        except (TargetError, OSError, KeyError, ValueError) as exc:
            result["message"] = str(exc)
        finally:
            if target is not None:
                target.close()
        results.append(result)
    return results


def prune_remote(target, settings_row: BackupSettings) -> list[str]:
    names = target.list_backups()
    keep = retention.select_to_keep(
        [(n, archive.parse_backup_time(n)) for n in names],
        settings_row.keep_daily, settings_row.keep_weekly, settings_row.keep_monthly,
    )
    removed = [n for n in names if n not in keep]
    for name in removed:
        target.delete(name)
    return removed


# ========== SCHEDULE ==========

async def run_if_due(db: AsyncSession, now: Optional[datetime] = None) -> str:
    """One scheduler tick: record the heartbeat, run a backup if one is due."""
    now = now or utcnow()
    settings_row = await get_settings(db)
    settings_row.last_scheduler_check_at = now
    await db.commit()
    if not settings_row.enabled:
        return "Backups are turned off."
    previous = await last_run(db)
    if not schedule.is_due(now, settings_row.schedule_mode, settings_row.daily_time,
                           settings_row.schedule_timezone, settings_row.interval_hours,
                           as_utc(previous.started_at) if previous else None):
        return "No backup due."
    run = await run_backup(db, "scheduled")
    return f"Backup {run.status}." if run else "Another backup is already running."


async def check_overdue(db: AsyncSession, scheduler_mode: str, now: Optional[datetime] = None) -> bool:
    """Email every admin once when backups have stopped succeeding. Runs in
    the web service, so it still fires when the thing that runs backups
    (cron) is what broke. Returns True when an alert was sent."""
    now = now or utcnow()
    settings_row = await get_settings(db)
    if (not settings_row.enabled or not settings_row.notify_on_failure
            or settings_row.overdue_alert_sent_at is not None):
        return False
    success = await last_run(db, "success")
    last_success_at = as_utc(success.started_at) if success else None
    if not schedule.is_overdue(now, settings_row.schedule_mode, settings_row.interval_hours,
                               last_success_at, as_utc(settings_row.enabled_at)):
        return False
    settings_row.overdue_alert_sent_at = now
    await db.commit()
    await EmailService.send_backup_overdue(
        await admin_emails(db), describe_time(last_success_at),
        scheduler_note(settings_row, scheduler_mode, now),
    )
    return True


def scheduler_note(settings_row: BackupSettings, scheduler_mode: str, now: datetime) -> Optional[str]:
    """Plain-language reason nothing may be running backups, or None."""
    if scheduler_mode == "off":
        return ("This server is set with BACKUP_SCHEDULER=off, so nothing runs scheduled "
                "backups. Only \"Back up now\" makes one.")
    last_check = as_utc(settings_row.last_scheduler_check_at)
    if last_check is None or now - last_check > schedule.overdue_threshold("interval", 1):
        if scheduler_mode == "cron":
            return ("The backup scheduler has not checked in recently. Check that the cron entry "
                    "installed by install.sh (or `backup.py install-cron`) is still there.")
        return "The backup scheduler has not checked in recently. Restarting the service starts it again."
    return None
