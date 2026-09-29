#!/usr/bin/env python3
"""ECTLogger backups from the command line.

    backup.py set-passphrase   Create the backup key (or change its passphrase)
    backup.py enable           Turn scheduled backups on (--daily HH:MM or --every-hours N)
    backup.py disable          Turn scheduled backups off
    backup.py run              Make a backup now (same as Admin > Backups > Back up now)
    backup.py run-if-due       Make one only if the schedule says so (what cron runs)
    backup.py status           Recent backups and the current settings
    backup.py verify FILE      Decrypt a backup and check every file in it
    backup.py restore FILE     Put a backup back in place (the service must be stopped)
    backup.py install-cron     Add the every-15-minutes scheduler entry to this user's crontab
    backup.py remove-cron      Take it out again

Run from anywhere; it switches to backend/ itself so the .env and a relative
SQLite path resolve the same way they do for the service. The passphrase is
read from the terminal, or from stdin when stdin is not a terminal.

A backup can also be opened without ECTLogger, with the stock age tool:
    age -d -i ectlogger-backup-key-<fp>.age ectlogger-<date>.tar.gz.age | tar xz
"""
import argparse
import asyncio
import getpass
import os
import shutil
import socket
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
# Paths typed on the command line are relative to where the command was run,
# so remember that before moving into backend/ (which the relative sqlite
# path in .env needs).
INVOCATION_DIR = Path.cwd()
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from app.backup import archive, keys, paths  # noqa: E402  (no config needed for these)

CRON_MARKER = "# ectlogger-backup"


def read_passphrase(prompt: str = "Backup passphrase: ") -> str:
    if sys.stdin.isatty():
        return getpass.getpass(prompt)
    return sys.stdin.readline().rstrip("\n")


# ========== COMMANDS THAT NEED THE DATABASE ==========

async def _with_db(func, *args, ensure_schema=False):
    import app.models  # noqa: F401  registers every table before init_db() below
    from app.database import AsyncSessionLocal, engine, init_db

    engine.echo = False  # APP_ENV=development turns on SQL echo; not wanted in a cron log
    try:
        if ensure_schema:
            # Setup commands can run before the service has ever started (from
            # install.sh), when the tables do not exist yet. Same call the
            # service makes at startup: it only creates what is missing.
            await init_db()
        async with AsyncSessionLocal() as db:
            return await func(db, *args)
    finally:
        await engine.dispose()


async def _cmd_run(db, trigger, user_id):
    from app.backup import runner

    run = await runner.run_backup(db, trigger, user_id)
    if run is None:
        print("Another backup is already running.")
        return 0
    print(f"Backup {run.status}: {run.filename or '-'}")
    if run.status != "success":
        print(runner.failure_detail(run))
    return 0 if run.status == "success" else 1


async def _cmd_run_if_due(db):
    from app.backup import runner

    message = await runner.run_if_due(db)
    # Quiet unless something happened: this runs every 15 minutes into a log.
    if message not in ("No backup due.", "Backups are turned off."):
        print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {message}")
    return 0


async def _cmd_status(db):
    from sqlalchemy import select

    from app.backup import runner
    from app.config import settings
    from app.models import BackupRun

    row = await runner.get_settings(db)
    print(f"Enabled:        {row.enabled}")
    when = f"daily at {row.daily_time} {row.schedule_timezone}" if row.schedule_mode == "daily" \
        else f"every {row.interval_hours} hours"
    print(f"Schedule:       {when}  (scheduler: {settings.backup_scheduler})")
    print(f"Keep:           {row.keep_daily} daily, {row.keep_weekly} weekly, {row.keep_monthly} monthly")
    print(f"Key:            {row.key_fingerprint or 'not set'}")
    print(f"Backup folder:  {paths.backup_dir()}")
    print(f"Last scheduler check: {runner.describe_time(row.last_scheduler_check_at) or 'never'}")
    runs = (await db.execute(select(BackupRun).order_by(BackupRun.id.desc()).limit(10))).scalars().all()
    print("\nRecent backups:")
    for run in runs:
        size = f"{run.size_bytes / 1_048_576:.1f} MB" if run.size_bytes else ""
        print(f"  #{run.id:<4} {runner.describe_time(run.started_at)}  {run.status:<8} {run.trigger:<9} "
              f"{run.filename or ''} {size}")
    return 0


async def _cmd_set_passphrase(db, replace):
    from app.backup import runner

    row = await runner.get_settings(db)
    current = None
    if row.key_recipient and not replace:
        current = read_passphrase("Current backup passphrase: ")
    new = read_passphrase("New backup passphrase: ")
    if sys.stdin.isatty() and read_passphrase("Repeat it: ") != new:
        print("Those did not match. Nothing was changed.")
        return 1
    try:
        action = runner.set_passphrase(row, new, current, replace)
    except (keys.BadPassphrase, ValueError) as exc:
        print(exc)
        return 1
    await db.commit()
    runner.write_key_file(row)
    print(f"Done: {action} ({row.key_fingerprint}).")
    print("Store the passphrase somewhere other than this server. Without it, no backup can be restored.")
    return 0


async def _cmd_enable(db, enabled, daily, every_hours, tz):
    from zoneinfo import ZoneInfo

    from app.backup import runner

    row = await runner.get_settings(db)
    if enabled:
        if not row.key_recipient:
            print("Set a passphrase first:  backup.py set-passphrase")
            return 1
        if every_hours:
            row.schedule_mode, row.interval_hours = "interval", every_hours
        elif daily:
            datetime.strptime(daily, "%H:%M")
            row.schedule_mode, row.daily_time = "daily", daily
        if tz:
            ZoneInfo(tz)
            row.schedule_timezone = tz
        if not row.enabled:
            row.enabled_at = runner.utcnow()
            row.overdue_alert_sent_at = None
    row.enabled = enabled
    await db.commit()
    return await _cmd_status(db)


async def _cmd_verify_run(db, run_id, passphrase):
    from app.backup import runner
    from app.models import BackupRun

    run = await db.get(BackupRun, run_id)
    if run is None or not run.filename:
        print(f"No backup file recorded for run {run_id}.")
        return 2
    settings_row = await runner.get_settings(db)
    path = paths.backup_dir() / run.filename
    result = _verify_file(path, passphrase, settings_row)
    run.verified_at = runner.utcnow()
    run.verify_ok = archive.passed(result)
    run.verify_detail = archive.describe(result)
    await db.commit()
    print(run.verify_detail)
    return 0 if run.verify_ok else 1


def _verify_file(path, passphrase, settings_row=None):
    if not path.is_file():
        return archive.VerifyResult(ok=False, problems=[f"The file is no longer on this server: {path.name}"])
    try:
        identity = _identity_for(path, passphrase, settings_row)
    except (keys.BadPassphrase, archive.BackupError) as exc:
        return archive.VerifyResult(ok=False, problems=[str(exc)])
    return archive.verify(path, identity)


def _identity_for(path: Path, passphrase: str, settings_row=None, key_file: Path = None):
    """Find the key that opens this backup: an explicit --key, the key files
    kept beside it, or the instance's current key."""
    import base64

    candidates = []
    if key_file:
        candidates.append(key_file.read_bytes())
    else:
        candidates += [p.read_bytes() for p in sorted(path.parent.glob("ectlogger-backup-key-*.age"))]
        if settings_row is not None and settings_row.key_wrapped_identity:
            candidates.append(base64.b64decode(settings_row.key_wrapped_identity))
    if not candidates:
        raise archive.BackupError("No backup key file found. Pass one with --key.")

    unlocked = []
    for wrapped in candidates:
        try:
            unlocked.append(keys.unwrap_identity(wrapped, passphrase))
        except keys.BadPassphrase:
            continue
    if not unlocked:
        raise keys.BadPassphrase("The passphrase does not unlock any backup key found.")

    if len(unlocked) == 1:
        return unlocked[0]
    # Several keys unlock with this passphrase (a key was replaced but the
    # passphrase kept). Rare, so simply try each against the whole file.
    import pyrage

    for identity in unlocked:
        try:
            with open(path, "rb") as reader, open(os.devnull, "wb") as sink:
                pyrage.decrypt_io(reader, sink, [identity])
            return identity
        except pyrage.DecryptError:
            continue
    raise archive.BackupError("None of the keys this passphrase unlocks were used for this backup.")


# ========== RESTORE ==========

def _user_path(value: str) -> Path:
    """A path argument as the operator meant it: relative to where they ran the command."""
    return (INVOCATION_DIR / value).resolve()


def _service_running() -> bool:
    from dotenv import dotenv_values

    port = int(dotenv_values(BACKEND_DIR / ".env").get("BACKEND_PORT") or 8000) \
        if (BACKEND_DIR / ".env").is_file() else 8000
    with socket.socket() as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _cmd_restore(args) -> int:
    from dotenv import dotenv_values

    source = _user_path(args.file)
    if not source.is_file():
        print(f"No such file: {source}")
        return 2
    if _service_running() and not args.force:
        print("The ECTLogger service appears to be running. Stop it first:\n"
              "    sudo systemctl stop ectlogger\n"
              "(or pass --force if something else is using that port).")
        return 2

    passphrase = read_passphrase()
    try:
        identity = _identity_for(source, passphrase,
                                 key_file=_user_path(args.key) if args.key else None)
    except (keys.BadPassphrase, archive.BackupError) as exc:
        print(exc)
        return 2

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    staging = BACKEND_DIR / f".restore-{stamp}"
    print(f"Decrypting {source.name} ...")
    try:
        result = archive.verify(source, identity)
        if not result.ok:
            print("This backup did not pass its checks, so nothing was changed:")
            print("\n".join(f"  {p}" for p in result.problems))
            return 1
        for warning in result.warnings:
            print(f"Warning: {warning}")
        manifest = archive.unpack(source, identity, staging)

        backup_migration = manifest.get("latest_migration")
        code_migration = archive.latest_migration()
        if backup_migration and code_migration and backup_migration > code_migration:
            print(f"This backup was made by newer code (migration {backup_migration}; this checkout "
                  f"has {code_migration}). Check out commit {manifest.get('git_commit')} first.")
            return 2

        # Configuration first: on a fresh server it decides where the database goes.
        env_notes = _restore_env(staging / "config", stamp, args.with_env)
        # Same precedence the service uses: environment, then backend/.env, then the default.
        env_file = BACKEND_DIR / ".env"
        database_url = os.environ.get("DATABASE_URL") \
            or (dotenv_values(env_file).get("DATABASE_URL") if env_file.is_file() else None) \
            or "sqlite:///./ectlogger.db"

        db_note = _restore_database(staging / "database", manifest, database_url, stamp)
        data_note = _move_into_place(staging / "data", paths.DATA_DIR, stamp)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    print("\nRestored:")
    for note in [db_note, data_note, *env_notes]:
        print(f"  {note}")
    if backup_migration and code_migration and backup_migration < code_migration:
        print(f"\nThis backup predates migration {code_migration}. Run migrations "
              f"{backup_migration + 1} through {code_migration} in backend/migrations/ before starting.")
    print("\nStart the service when ready:  sudo systemctl start ectlogger")
    return 0


def _move_into_place(new: Path, current: Path, stamp: str) -> str:
    if not new.exists():
        return f"{current.name}: not in this backup, left as it was"
    note = ""
    if current.exists():
        aside = current.with_name(f"{current.name}.pre-restore-{stamp}")
        current.rename(aside)
        note = f" (previous copy kept as {aside.name})"
    shutil.move(str(new), str(current))
    return f"{current.relative_to(BACKEND_DIR.parent)}{note}"


def _restore_database(folder: Path, manifest: dict, database_url: str, stamp: str) -> str:
    if manifest.get("database") == "sqlite":
        target = paths.sqlite_db_path(database_url)
        if target is None:
            return ("Database: this backup is SQLite, but DATABASE_URL points at a database server. "
                    "Nothing was changed.")
        return _move_into_place(folder / "ectlogger.db", target, stamp)
    dump = BACKEND_DIR / f"database-{stamp}.sql"
    shutil.move(str(folder / "database.sql"), dump)
    return (f"Database: PostgreSQL dump written to {dump.name}. Load it into an empty database with\n"
            f'      psql "$DATABASE_URL" < {dump}')


def _restore_env(folder: Path, stamp: str, replace: bool) -> list[str]:
    notes = []
    for name, target in paths.ENV_FILES.items():
        saved = folder / name
        if not saved.is_file():
            continue
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(saved, target)
            notes.append(f"{target.relative_to(BACKEND_DIR.parent)} (there was none)")
        elif replace:
            notes.append(_move_into_place(saved, target, stamp))
        else:
            side = target.with_name(".env.from-backup")
            shutil.copy2(saved, side)
            os.chmod(side, 0o600)
            notes.append(f"{side.relative_to(BACKEND_DIR.parent)}: the backup's copy, beside your "
                         "current .env. Its SECRET_KEY must be the one in use, or every admin's "
                         "two-factor login stops working. Use --with-env to replace .env instead.")
    return notes


# ========== CRON ==========

def _cron_line() -> str:
    log = paths.backup_dir() / "backup.log"
    return (f"*/15 * * * * cd {BACKEND_DIR} && {sys.executable} scripts/backup.py run-if-due "
            f">> {log} 2>&1 {CRON_MARKER}")


def _read_crontab() -> list[str]:
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    return result.stdout.splitlines() if result.returncode == 0 else []


def _write_crontab(lines: list[str]) -> None:
    subprocess.run(["crontab", "-"], input="\n".join(lines) + "\n", text=True, check=True)


def _cmd_install_cron() -> int:
    if shutil.which("crontab") is None:
        print("crontab is not installed. Install cron, or set BACKUP_SCHEDULER=internal in backend/.env.")
        return 2
    paths.ensure_private_dir(paths.backup_dir())
    lines = [line for line in _read_crontab() if CRON_MARKER not in line]
    lines.append(_cron_line())
    _write_crontab(lines)
    print(f"Installed: {_cron_line()}")
    return 0


def _cmd_remove_cron() -> int:
    lines = _read_crontab()
    kept = [line for line in lines if CRON_MARKER not in line]
    if len(kept) == len(lines):
        print("No ECTLogger backup entry in this user's crontab.")
        return 0
    _write_crontab(kept)
    print("Removed the ECTLogger backup entry.")
    return 0


# ========== ENTRY ==========

def main() -> int:
    parser = argparse.ArgumentParser(description="ECTLogger backups",
                                     formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    setpass = sub.add_parser("set-passphrase", help="create the backup key, or change its passphrase")
    setpass.add_argument("--replace", action="store_true",
                         help="make a new key instead (the current passphrase is not needed)")
    enable = sub.add_parser("enable", help="turn scheduled backups on")
    when = enable.add_mutually_exclusive_group()
    when.add_argument("--daily", metavar="HH:MM", help="once a day at this time")
    when.add_argument("--every-hours", type=int, metavar="N", help="every N hours")
    enable.add_argument("--timezone", help="IANA time zone for --daily, e.g. America/New_York")
    sub.add_parser("disable", help="turn scheduled backups off")

    run = sub.add_parser("run", help="make a backup now")
    run.add_argument("--trigger", choices=["manual", "scheduled"], default="manual")
    run.add_argument("--user-id", type=int, help="admin who asked for it (set by the admin panel)")
    sub.add_parser("run-if-due", help="make a backup if the schedule says one is due")
    sub.add_parser("status", help="show settings and recent backups")

    verify = sub.add_parser("verify", help="decrypt a backup and check it")
    target = verify.add_mutually_exclusive_group(required=True)
    target.add_argument("file", nargs="?", help="backup file")
    target.add_argument("--run-id", type=int, help="backup from the history (records the result)")
    verify.add_argument("--key", help="key file, if it is not beside the backup")

    restore = sub.add_parser("restore", help="put a backup back in place")
    restore.add_argument("file", help="backup file (.tar.gz.age)")
    restore.add_argument("--key", help="key file, if it is not beside the backup")
    restore.add_argument("--with-env", action="store_true",
                         help="replace existing .env files with the backup's copies")
    restore.add_argument("--force", action="store_true",
                         help="restore even though the service port answers")

    sub.add_parser("install-cron", help="add the scheduler entry to this user's crontab")
    sub.add_parser("remove-cron", help="remove the scheduler entry")

    args = parser.parse_args()

    if args.command == "set-passphrase":
        return asyncio.run(_with_db(_cmd_set_passphrase, args.replace, ensure_schema=True))
    if args.command == "enable":
        return asyncio.run(_with_db(_cmd_enable, True, args.daily, args.every_hours, args.timezone,
                                    ensure_schema=True))
    if args.command == "disable":
        return asyncio.run(_with_db(_cmd_enable, False, None, None, None))
    if args.command == "run":
        return asyncio.run(_with_db(_cmd_run, args.trigger, args.user_id))
    if args.command == "run-if-due":
        return asyncio.run(_with_db(_cmd_run_if_due))
    if args.command == "status":
        return asyncio.run(_with_db(_cmd_status))
    if args.command == "verify":
        passphrase = read_passphrase()
        if args.run_id:
            return asyncio.run(_with_db(_cmd_verify_run, args.run_id, passphrase))
        path = _user_path(args.file)
        try:
            identity = _identity_for(path, passphrase,
                                     key_file=_user_path(args.key) if args.key else None)
        except (keys.BadPassphrase, archive.BackupError) as exc:
            print(exc)
            return 1
        result = archive.verify(path, identity)
        print(archive.describe(result))
        return 0 if archive.passed(result) else 1
    if args.command == "restore":
        return _cmd_restore(args)
    if args.command == "install-cron":
        return _cmd_install_cron()
    if args.command == "remove-cron":
        return _cmd_remove_cron()
    return 2


if __name__ == "__main__":
    sys.exit(main())
