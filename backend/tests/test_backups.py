"""Backups: key handling, the archive round trip, retention, the schedule,
the runner, off-site targets and the admin API.

Filesystem locations (database file, data/, .env files, backup folder) are
pointed at tmp_path, so nothing here touches the real instance.
"""
import base64
import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import select

from app.backup import archive, keys, paths, retention, runner, schedule
from app.backup import targets as backup_targets
from app.config import settings
from app.derived_keys import MFA_SECRET_PURPOSE, fernet_from_secret
from app.models import BackupRun, BackupSettings, BackupTarget
from tests.conftest import auth_headers

PASS = "correct horse battery staple"
UTC = timezone.utc
INSTANCE_SECRET_KEY = "the-instance-secret-key"


def _mfa_token(secret_key: str) -> str:
    return fernet_from_secret(secret_key, MFA_SECRET_PURPOSE).encrypt(b"JBSWY3DPEHPK3PXP").decode()


# ========== FIXTURES ==========

@pytest.fixture()
def instance(tmp_path, monkeypatch):
    """A fake instance on disk: a SQLite database, uploads and .env files."""
    db_file = tmp_path / "ectlogger.db"
    conn = sqlite3.connect(db_file)
    conn.execute("CREATE TABLE nets (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO nets (name) VALUES ('Tuesday Net')")
    conn.execute("CREATE TABLE check_ins (id INTEGER PRIMARY KEY, callsign TEXT)")
    conn.executemany("INSERT INTO check_ins (callsign) VALUES (?)", [("W1PINE",), ("K1COVE",)])
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, callsign TEXT, mfa_enabled BOOLEAN,"
                 " mfa_secret_encrypted TEXT)")
    # One admin enrolled in two-factor, encrypted under this instance's SECRET_KEY
    # (backend.env below), the way the running app would have stored it.
    conn.execute("INSERT INTO users VALUES (1, 'W1DEMO', 1, ?)", (_mfa_token(INSTANCE_SECRET_KEY),))
    conn.execute("INSERT INTO users VALUES (2, 'W1PINE', 0, NULL)")
    conn.commit()
    conn.close()

    data = tmp_path / "data"
    (data / "avatars").mkdir(parents=True)
    (data / "avatars" / "1.png").write_bytes(b"\x89PNG fake avatar")
    (data / "chat_images").mkdir()
    (data / "chat_images" / "a.jpg").write_bytes(b"jpeg" * 1000)

    backend_env = tmp_path / "backend.env"
    backend_env.write_text(f"SECRET_KEY={INSTANCE_SECRET_KEY}\n")
    frontend_env = tmp_path / "frontend.env"
    frontend_env.write_text("VITE_API_URL=https://example.org/api\n")

    real_sqlite_db_path = paths.sqlite_db_path
    monkeypatch.setattr(paths, "sqlite_db_path",
                        lambda url=None: db_file if url is None else real_sqlite_db_path(url))
    monkeypatch.setattr(paths, "DATA_DIR", data)
    monkeypatch.setattr(paths, "ENV_FILES", {"backend.env": backend_env, "frontend.env": frontend_env})
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path / "backups"))
    return tmp_path


@pytest.fixture(scope="module")
def backup_key():
    return keys.generate_key(PASS)


@pytest.fixture()
def sent_emails(monkeypatch):
    """Captures backup alerts instead of sending them. EmailService is one
    class shared by the runner and the router, so patching it covers both."""
    sent = []

    def recorder(kind):
        async def _send(*args, **kwargs):
            sent.append((kind, args, kwargs))
        return _send

    for kind in ("send_backup_failed", "send_backup_overdue", "send_backup_downloaded"):
        monkeypatch.setattr(runner.EmailService, kind, recorder(kind))
    return sent


async def _configure(db, key, **overrides):
    row = await runner.get_settings(db)
    row.key_recipient = key.recipient
    row.key_wrapped_identity = base64.b64encode(key.wrapped_identity).decode()
    row.key_fingerprint = key.fingerprint
    for field, value in overrides.items():
        setattr(row, field, value)
    await db.commit()
    return row


# ========== KEYS ==========

def test_key_unwraps_with_its_passphrase(backup_key):
    identity = keys.unwrap_identity(backup_key.wrapped_identity, PASS)
    assert str(identity.to_public()) == backup_key.recipient
    assert backup_key.fingerprint == keys.fingerprint_of(backup_key.recipient)


def test_wrong_passphrase_is_refused(backup_key):
    with pytest.raises(keys.BadPassphrase):
        keys.unwrap_identity(backup_key.wrapped_identity, "not the passphrase")


def test_short_passphrase_is_refused():
    with pytest.raises(ValueError):
        keys.generate_key("short")


def test_rewrap_keeps_the_same_key(backup_key):
    rewrapped = keys.rewrap(backup_key.wrapped_identity, PASS, "a brand new passphrase")
    identity = keys.unwrap_identity(rewrapped, "a brand new passphrase")
    assert str(identity.to_public()) == backup_key.recipient
    with pytest.raises(keys.BadPassphrase):
        keys.unwrap_identity(rewrapped, PASS)


# ========== ARCHIVE ==========

def test_backup_round_trip(instance, backup_key):
    built = archive.build_backup(backup_key.recipient, backup_key.fingerprint)
    assert archive.parse_backup_time(built.path.name)
    assert oct(built.path.stat().st_mode)[-3:] == "600"
    assert b"Tuesday Net" not in built.path.read_bytes()  # encrypted, not just compressed
    assert set(built.manifest["files"]) >= {
        "database/ectlogger.db", "data/avatars/1.png", "data/chat_images/a.jpg",
        "config/backend.env", "config/frontend.env",
    }
    # No plaintext left behind next to the backups.
    assert [p.name for p in built.path.parent.iterdir()] == [built.path.name]

    identity = keys.unwrap_identity(backup_key.wrapped_identity, PASS)
    result = archive.verify(built.path, identity)
    assert result.ok, result.problems
    assert archive.passed(result)
    assert result.summary == {"uploaded_files": 2, "users": 2, "nets": 1, "check_ins": 2, "mfa_secrets": 1}
    report = archive.describe(result)
    assert "2 users, 1 nets, 2 check-ins and 2 uploaded files" in report
    assert "opens all 1 two-factor secrets" in report

    out = instance / "unpacked"
    archive.unpack(built.path, identity, out)
    conn = sqlite3.connect(out / "database" / "ectlogger.db")
    assert conn.execute("SELECT name FROM nets").fetchone() == ("Tuesday Net",)
    conn.close()
    assert (out / "data" / "avatars" / "1.png").read_bytes() == b"\x89PNG fake avatar"


def test_secret_key_that_cannot_open_two_factor_is_a_warning(instance, backup_key):
    """The failure a restore would otherwise hit silently: the database comes
    back, but its SECRET_KEY is not the one the two-factor secrets were
    encrypted with, so every enrolled admin is locked out. "Check this backup"
    fails on it; restore still proceeds, since the data is intact."""
    conn = sqlite3.connect(instance / "ectlogger.db")
    conn.execute("UPDATE users SET mfa_secret_encrypted = ? WHERE id = 1", (_mfa_token("some-other-key"),))
    conn.commit()
    conn.close()
    built = archive.build_backup(backup_key.recipient, backup_key.fingerprint)
    result = archive.verify(built.path, keys.unwrap_identity(backup_key.wrapped_identity, PASS))
    assert result.ok and not archive.passed(result)
    assert "opens only 0 of 1 two-factor secrets" in result.warnings[0]
    assert archive.describe(result).startswith("Warning: ")


def test_wrong_key_cannot_open_a_backup(instance, backup_key):
    built = archive.build_backup(backup_key.recipient, backup_key.fingerprint)
    stranger = keys.unwrap_identity(keys.generate_key("another long passphrase").wrapped_identity,
                                    "another long passphrase")
    result = archive.verify(built.path, stranger)
    assert not result.ok and "not made with this backup key" in result.problems[0]


def test_tampered_backup_fails_verification(instance, backup_key):
    built = archive.build_backup(backup_key.recipient, backup_key.fingerprint)
    data = bytearray(built.path.read_bytes())
    data[-100] ^= 0xFF
    built.path.write_bytes(bytes(data))
    identity = keys.unwrap_identity(backup_key.wrapped_identity, PASS)
    assert not archive.verify(built.path, identity).ok


def test_stock_age_tool_can_open_a_backup(instance, backup_key):
    """The documented escape hatch: no ECTLogger needed, just age."""
    age = shutil.which("age")
    if age is None:
        pytest.skip("age is not installed here")
    built = archive.build_backup(backup_key.recipient, backup_key.fingerprint)
    identity = keys.unwrap_identity(backup_key.wrapped_identity, PASS)
    key_file = instance / "plain-key.txt"
    key_file.write_text(str(identity) + "\n")
    out = subprocess.run([age, "-d", "-i", str(key_file), str(built.path)], capture_output=True)
    assert out.returncode == 0 and out.stdout[:2] == b"\x1f\x8b"  # gzip


def test_cli_reads_relative_paths_from_where_it_was_run(tmp_path):
    """The docs say `backup.py restore ectlogger-....tar.gz.age` from the folder
    holding the file. The script moves into backend/ as it starts, and used to
    look for the file there instead, so a restore run as documented said
    "No such file" (found on the first real restore test, 2026-09-29)."""
    script = Path(__file__).resolve().parents[1] / "scripts" / "backup.py"
    out = subprocess.run([sys.executable, str(script), "restore", "missing.tar.gz.age"],
                         cwd=tmp_path, capture_output=True, text=True, timeout=60)
    assert f"No such file: {tmp_path / 'missing.tar.gz.age'}" in out.stdout, out.stdout + out.stderr


def test_unsafe_tar_entries_are_refused():
    import tarfile
    for name in ("../escape", "/etc/passwd"):
        member = tarfile.TarInfo(name)
        with pytest.raises(archive.BackupError):
            archive._check_member(member)
    link = tarfile.TarInfo("data/link")
    link.type = tarfile.SYMTYPE
    with pytest.raises(archive.BackupError):
        archive._check_member(link)


# ========== RETENTION ==========

def test_retention_keeps_newest_per_day_week_month():
    start = datetime(2026, 1, 1, 3, 0, tzinfo=UTC)
    backups = [(f"b{i}", start + timedelta(days=i)) for i in range(120)]
    # two on the newest day: only the later one counts for that day
    backups.append(("late", start + timedelta(days=119, hours=5)))
    keep = retention.select_to_keep(backups, daily=7, weekly=4, monthly=3)
    assert "late" in keep and "b119" not in keep
    daily = {f"b{i}" for i in range(113, 119)}
    assert daily <= keep
    assert len(keep) <= 7 + 4 + 3


def test_retention_always_keeps_the_newest():
    now = datetime(2026, 5, 1, tzinfo=UTC)
    assert retention.select_to_keep([("only", now)], 0, 0, 0) == {"only"}
    assert retention.select_to_keep([], 7, 4, 6) == set()


# ========== SCHEDULE ==========

def test_daily_schedule_runs_once_per_slot():
    tz = "America/New_York"
    now = datetime(2026, 9, 28, 8, 0, tzinfo=UTC)  # 04:00 EDT
    assert schedule.is_due(now, "daily", "03:00", tz, 24, None)
    assert schedule.is_due(now, "daily", "03:00", tz, 24, now - timedelta(hours=2))  # 02:00 EDT, before slot
    assert not schedule.is_due(now, "daily", "03:00", tz, 24, now - timedelta(minutes=30))
    # slot later today: yesterday's slot governs
    assert not schedule.is_due(now, "daily", "05:00", tz, 24, now - timedelta(hours=20))


def test_missed_daily_slot_runs_when_the_server_returns():
    now = datetime(2026, 9, 28, 14, 0, tzinfo=UTC)
    yesterday = datetime(2026, 9, 27, 7, 0, tzinfo=UTC)
    assert schedule.is_due(now, "daily", "03:00", "America/New_York", 24, yesterday)


def test_interval_schedule():
    now = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
    assert schedule.is_due(now, "interval", "03:00", "UTC", 6, now - timedelta(hours=6))
    assert not schedule.is_due(now, "interval", "03:00", "UTC", 6, now - timedelta(hours=5))


def test_overdue_threshold():
    now = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
    assert not schedule.is_overdue(now, "daily", 24, now - timedelta(hours=35), None)
    assert schedule.is_overdue(now, "daily", 24, now - timedelta(hours=37), None)
    assert schedule.is_overdue(now, "interval", 6, None, now - timedelta(hours=10))
    assert not schedule.is_overdue(now, "daily", 24, None, None)


# ========== RUNNER ==========

@pytest.mark.asyncio
async def test_run_backup_success(db, instance, backup_key, sent_emails):
    await _configure(db, backup_key)
    run = await runner.run_backup(db, "manual")
    assert run.status == "success", run.error
    assert (paths.backup_dir() / run.filename).is_file()
    assert (paths.backup_dir() / keys.key_filename(backup_key.fingerprint)).is_file()
    assert run.key_fingerprint == backup_key.fingerprint
    assert sent_emails == []


@pytest.mark.asyncio
async def test_run_without_a_key_fails_and_emails_admins(db, instance, admin, sent_emails):
    run = await runner.run_backup(db, "scheduled")
    assert run.status == "failed" and "passphrase" in run.error
    assert sent_emails and sent_emails[0][0] == "send_backup_failed"
    assert sent_emails[0][1][0] == [admin.email]


@pytest.mark.asyncio
async def test_failure_email_can_be_turned_off(db, instance, sent_emails):
    row = await runner.get_settings(db)
    row.notify_on_failure = False
    await db.commit()
    run = await runner.run_backup(db, "scheduled")
    assert run.status == "failed" and sent_emails == []


@pytest.mark.asyncio
async def test_failed_target_makes_a_partial_run(db, instance, backup_key, admin, sent_emails):
    await _configure(db, backup_key)
    db.add(BackupTarget(name="Nowhere", kind="sftp", enabled=True,
                        config_json=json.dumps({"host": "127.0.0.1", "port": 1, "username": "x", "path": "."}),
                        secret_encrypted=backup_targets.encrypt_secret(
                            backup_targets.generate_ssh_keypair("t")[0])))
    await db.commit()
    run = await runner.run_backup(db, "manual")
    assert run.status == "partial", run.error
    results = json.loads(run.target_results)
    assert results[0]["ok"] is False and results[0]["name"] == "Nowhere"
    assert (paths.backup_dir() / run.filename).is_file()  # the local copy still exists
    assert sent_emails[0][1][1] == "partial"


@pytest.mark.asyncio
async def test_concurrent_backup_is_skipped(db, instance, backup_key):
    await _configure(db, backup_key)
    with runner.backup_lock() as held:
        assert held
        assert runner.backup_in_progress()
        # A second backup waits briefly, then gives up rather than overlapping.
        assert await runner.run_backup(db, "manual") is None
    assert not runner.backup_in_progress()


@pytest.mark.asyncio
async def test_interrupted_run_is_marked_failed(db, instance, backup_key, sent_emails):
    await _configure(db, backup_key)
    db.add(BackupRun(trigger="scheduled", status="running", started_at=datetime.now(UTC)))
    await db.commit()
    await runner.run_backup(db, "manual")
    stale = (await db.execute(select(BackupRun).order_by(BackupRun.id))).scalars().first()
    assert stale.status == "failed" and "Interrupted" in stale.error


def _scratch(folder, name, age_seconds):
    path = folder / name
    (path / "database").mkdir(parents=True)
    (path / "database" / "ectlogger.db").write_bytes(b"decrypted plaintext")
    when = time.time() - age_seconds
    os.utime(path, (when, when))
    return path


def test_stale_scratch_folders_are_removed(tmp_path):
    """A build or check killed outright leaves decrypted data behind; the next
    run removes it. One still inside the age limit may belong to a check in
    progress, and ordinary files are never touched."""
    old_check = _scratch(tmp_path, ".verify-killed", 2 * 3600)
    old_build = _scratch(tmp_path, ".staging-killed", 2 * 3600)
    old_restore = _scratch(tmp_path, ".restore-killed", 2 * 3600)
    running = _scratch(tmp_path, ".verify-running", 60)
    other = _scratch(tmp_path, "not-scratch", 2 * 3600)
    backup = tmp_path / "ectlogger-20260101-030000.tar.gz.age"
    backup.write_bytes(b"x")

    removed = archive.remove_stale_scratch(tmp_path)
    assert sorted(removed) == [".restore-killed", ".staging-killed", ".verify-killed"]
    assert not old_check.exists() and not old_build.exists() and not old_restore.exists()
    assert running.exists() and other.exists() and backup.exists()


@pytest.mark.asyncio
async def test_scheduler_check_removes_stale_scratch(db, instance, tmp_path, monkeypatch):
    """Every 15-minute check cleans up, even with backups turned off: beside
    the backups, and in backend/ where a restore unpacks."""
    leftover = _scratch(paths.ensure_private_dir(paths.backup_dir()), ".verify-killed", 2 * 3600)
    backend = tmp_path / "backend"
    backend.mkdir()
    monkeypatch.setattr(paths, "BACKEND_DIR", backend)
    killed_restore = _scratch(backend, ".restore-killed", 2 * 3600)
    assert await runner.run_if_due(db) == "Backups are turned off."
    assert not leftover.exists() and not killed_restore.exists()


def _load_cli(monkeypatch):
    """scripts/backup.py as a module. It moves into backend/ as it loads, so
    the working directory is put back afterwards."""
    monkeypatch.chdir(os.getcwd())
    script = Path(__file__).resolve().parents[1] / "scripts" / "backup.py"
    spec = importlib.util.spec_from_file_location("backup_cli", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("replace", [False, True])
def test_restored_env_files_are_private(instance, tmp_path, monkeypatch, replace):
    """.env holds SECRET_KEY and the SMTP password. A restore wrote it with
    whatever mode came out of the archive (644 on the first real restore test,
    2026-09-29), so any account on the server could read it."""
    cli = _load_cli(monkeypatch)
    saved = tmp_path / "unpacked"
    saved.mkdir()
    for name in paths.ENV_FILES:
        (saved / name).write_text("SECRET_KEY=from-backup\n")
        os.chmod(saved / name, 0o644)
    backend_env = paths.ENV_FILES["backend.env"]
    frontend_env = paths.ENV_FILES["frontend.env"]
    frontend_env.unlink()  # a fresh server: nothing there yet

    cli._restore_env(saved, "20260929-120000", replace)

    assert frontend_env.stat().st_mode & 0o777 == 0o600
    written = backend_env if replace else backend_env.with_name(".env.from-backup")
    assert written.read_text() == "SECRET_KEY=from-backup\n"
    assert written.stat().st_mode & 0o777 == 0o600


@pytest.mark.asyncio
async def test_local_retention_prunes_old_backups(db, instance, backup_key, sent_emails):
    await _configure(db, backup_key, keep_daily=2, keep_weekly=0, keep_monthly=0)
    folder = paths.ensure_private_dir(paths.backup_dir())
    for day in (1, 2, 3):
        (folder / archive.backup_filename(datetime(2026, 1, day, 3, tzinfo=UTC))).write_bytes(b"old")
    run = await runner.run_backup(db, "manual")
    names = sorted(p.name for p in runner.local_backups())
    assert run.filename in names and len(names) == 2
    assert archive.backup_filename(datetime(2026, 1, 3, 3, tzinfo=UTC)) in names


@pytest.mark.asyncio
async def test_run_if_due_records_heartbeat_and_respects_enabled(db, instance, backup_key, sent_emails):
    await _configure(db, backup_key)
    assert await runner.run_if_due(db) == "Backups are turned off."
    row = await runner.get_settings(db)
    assert row.last_scheduler_check_at is not None
    row.enabled = True
    await db.commit()
    assert (await runner.run_if_due(db)).startswith("Backup success")
    assert await runner.run_if_due(db) == "No backup due."


@pytest.mark.asyncio
async def test_overdue_alert_is_sent_once(db, instance, admin, sent_emails):
    row = await runner.get_settings(db)
    row.enabled = True
    row.enabled_at = datetime.now(UTC) - timedelta(days=3)
    await db.commit()
    assert await runner.check_overdue(db, "cron")
    assert not await runner.check_overdue(db, "cron")
    kinds = [s[0] for s in sent_emails]
    assert kinds == ["send_backup_overdue"]
    # The note explains that the scheduler has never checked in.
    assert "cron" in sent_emails[0][1][2]


# ========== TARGETS ==========

def test_host_key_fingerprint_matches_ssh_keygen(tmp_path):
    if not Path("/usr/bin/ssh-keygen").exists():
        pytest.skip("ssh-keygen not installed")
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(tmp_path / "k")], check=True)
    line = (tmp_path / "k.pub").read_text().strip()
    expected = subprocess.run(["ssh-keygen", "-lf", str(tmp_path / "k.pub")], capture_output=True,
                              text=True).stdout.split()[1]
    assert backup_targets.host_key_fingerprint(line) == expected


def test_generated_ssh_key_round_trips():
    private, public = backup_targets.generate_ssh_keypair("ectlogger-backup")
    assert public.startswith("ssh-ed25519 ") and public.endswith(" ectlogger-backup")
    assert backup_targets.public_key_of(private) == " ".join(public.split()[:2])


def test_target_secrets_are_encrypted():
    token = backup_targets.encrypt_secret("hunter2")
    assert "hunter2" not in token
    assert backup_targets.decrypt_secret(token) == "hunter2"
    assert backup_targets.decrypt_secret("garbage") is None


@pytest.mark.skipif(importlib.util.find_spec("moto") is None, reason="moto not installed")
def test_s3_target_upload_list_prune(tmp_path, monkeypatch):
    from moto import mock_aws
    import boto3

    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="ect-backups")
        target = backup_targets.S3Target(
            backup_targets.S3Config(endpoint_url=None, region="us-east-1", bucket="ect-backups",
                                    prefix="ect/", access_key_id="x"), "y")
        assert "ect-backups" in target.check()
        for day in (1, 2, 3):
            name = archive.backup_filename(datetime(2026, 1, day, tzinfo=UTC))
            (tmp_path / name).write_bytes(b"x")
            target.upload(tmp_path / name, name)
        (tmp_path / "ectlogger-backup-key-abcd1234.age").write_bytes(b"k")
        target.upload(tmp_path / "ectlogger-backup-key-abcd1234.age", "ectlogger-backup-key-abcd1234.age")
        assert len(target.list_backups()) == 3  # key file is not a backup
        settings_row = BackupSettings(keep_daily=1, keep_weekly=0, keep_monthly=0)
        removed = runner.prune_remote(target, settings_row)
        assert len(removed) == 2 and len(target.list_backups()) == 1


# ========== API ==========

@pytest.mark.asyncio
async def test_backups_api_is_admin_only(client, owner):
    response = await client.get("/api/backups", headers=auth_headers(owner))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cannot_enable_without_a_key(client, admin, instance):
    body = {"enabled": True, "schedule_mode": "daily", "daily_time": "03:00",
            "schedule_timezone": "America/New_York"}
    response = await client.put("/api/backups/settings", json=body, headers=auth_headers(admin))
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_key_lifecycle_via_api(client, admin, instance):
    headers = auth_headers(admin)
    response = await client.post("/api/backups/key", json={"passphrase": PASS}, headers=headers)
    assert response.status_code == 200
    first = response.json()["key_fingerprint"]
    assert first and PASS not in response.text

    # Changing the passphrase keeps the key, and needs the current passphrase.
    bad = await client.post("/api/backups/key", json={"passphrase": "new passphrase here",
                                                      "current_passphrase": "wrong one"}, headers=headers)
    assert bad.status_code == 400
    good = await client.post("/api/backups/key", json={"passphrase": "new passphrase here",
                                                       "current_passphrase": PASS}, headers=headers)
    assert good.status_code == 200 and good.json()["key_fingerprint"] == first

    replaced = await client.post("/api/backups/key", json={"passphrase": "entirely new key pass",
                                                           "replace": True}, headers=headers)
    assert replaced.json()["key_fingerprint"] != first
    # Both key files stay beside the backups: older backups need the old one.
    assert len(list(paths.backup_dir().glob("ectlogger-backup-key-*.age"))) == 2

    enable = await client.put("/api/backups/settings", json={
        "enabled": True, "schedule_mode": "interval", "interval_hours": 12}, headers=headers)
    assert enable.status_code == 200 and enable.json()["enabled"] and enable.json()["enabled_at"]


@pytest.mark.asyncio
async def test_sftp_target_gets_a_generated_key_and_no_secret_leaks(client, admin, db):
    response = await client.post("/api/backups/targets", headers=auth_headers(admin), json={
        "kind": "sftp", "name": "Home", "host": "10.0.0.5", "username": "ectlogger", "path": "inbox"})
    assert response.status_code == 201
    body = response.json()
    assert body["public_key"].startswith("ssh-ed25519 ") and body["port"] == 22
    assert body["host_key_fingerprint"] is None and "PRIVATE" not in response.text

    stored = await db.get(BackupTarget, body["id"])
    await db.refresh(stored)
    host_key = "ssh-ed25519 " + base64.b64encode(b"\x00\x00\x00\x0bssh-ed25519" + b"k" * 36).decode()
    trusted = await client.post(f"/api/backups/targets/{body['id']}/trust-host-key",
                                json={"host_key": host_key}, headers=auth_headers(admin))
    assert trusted.json()["host_key_fingerprint"].startswith("SHA256:")

    # Moving the target to another server drops the trusted host key.
    moved = await client.put(f"/api/backups/targets/{body['id']}", headers=auth_headers(admin), json={
        "name": "Home", "host": "10.0.0.6", "username": "ectlogger", "path": "inbox"})
    assert moved.json()["host_key_fingerprint"] is None


@pytest.mark.asyncio
async def test_s3_target_requires_credentials(client, admin):
    response = await client.post("/api/backups/targets", headers=auth_headers(admin), json={
        "kind": "s3", "name": "B2", "bucket": "b"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_download_needs_a_valid_two_factor_code(client, admin, db, instance, backup_key, sent_emails):
    await _configure(db, backup_key)
    run = await runner.run_backup(db, "manual")
    response = await client.post(f"/api/backups/runs/{run.id}/download", json={"mfa_code": "000000"},
                                 headers=auth_headers(admin))
    assert response.status_code == 403
    assert not any(kind == "send_backup_downloaded" for kind, *_ in sent_emails)


@pytest.mark.asyncio
async def test_download_with_valid_code_notifies_admins(client, admin, db, instance, backup_key,
                                                        sent_emails):
    import pyotp
    from app.auth import encrypt_mfa_secret

    secret = pyotp.random_base32()
    admin.mfa_secret_encrypted = encrypt_mfa_secret(secret)
    await db.commit()
    await _configure(db, backup_key)
    run = await runner.run_backup(db, "manual")
    response = await client.post(f"/api/backups/runs/{run.id}/download",
                                 json={"mfa_code": pyotp.TOTP(secret).now()}, headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.content == (paths.backup_dir() / run.filename).read_bytes()
    assert any(kind == "send_backup_downloaded" for kind, *_ in sent_emails)


@pytest.mark.asyncio
async def test_run_history_lists_runs(client, admin, db, instance, backup_key, sent_emails):
    await _configure(db, backup_key)
    await runner.run_backup(db, "manual", admin.id)
    response = await client.get("/api/backups/runs", headers=auth_headers(admin))
    runs = response.json()
    assert runs[0]["status"] == "success" and runs[0]["file_available"]
    assert runs[0]["triggered_by_callsign"] == admin.callsign


def test_scheduler_note_waits_for_first_check_after_enabling():
    now = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
    row = BackupSettings(enabled=True, enabled_at=now - timedelta(minutes=10), last_scheduler_check_at=None)
    assert runner.scheduler_note(row, "cron", now) is None
    row.enabled_at = now - timedelta(hours=3)
    assert "cron" in runner.scheduler_note(row, "cron", now)
    row.last_scheduler_check_at = now - timedelta(minutes=14)
    assert runner.scheduler_note(row, "cron", now) is None
