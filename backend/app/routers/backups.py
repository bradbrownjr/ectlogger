"""Admin > Backups.

Every route is admin-only (get_admin_user, which also requires MFA). The
heavy lifting -- building, uploading, decrypting -- happens in
scripts/backup.py, started from here (see app/backup/process.py), so a
backup never blocks the web service.
"""
import asyncio
import base64
import json
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import decrypt_mfa_secret, verify_totp_code
from app.backup import keys, paths, process, runner, schedule
from app.backup.targets import (
    TargetError, UntrustedHostKey, encrypt_secret, generate_ssh_keypair, host_key_fingerprint,
    open_target, public_key_of, decrypt_secret,
)
from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_user
from app.email_service import EmailService
from app.logger import logger
from app.models import BackupRun, BackupTarget, User
from app.schemas import (
    BackupDownloadRequest, BackupKeyRequest, BackupOverview, BackupPassphrase, BackupRunResponse,
    BackupSettingsUpdate, BackupTargetCreate, BackupTargetResponse, BackupTargetResult,
    BackupTargetTestResult, BackupTargetUpdate, BackupTrustHostKey,
)
from app.security import get_client_ip

router = APIRouter(prefix="/backups", tags=["backups"])

SFTP_FIELDS = ("host", "port", "username", "path")
S3_FIELDS = ("endpoint_url", "region", "bucket", "prefix", "access_key_id")


# ========== OVERVIEW AND SETTINGS ==========

@router.get("", response_model=BackupOverview)
async def get_overview(db: AsyncSession = Depends(get_db), _admin: User = Depends(get_admin_user)):
    """Settings, key status, scheduler health and local storage at a glance."""
    row = await runner.get_settings(db)
    now = runner.utcnow()
    success = await runner.last_run(db, "success")
    files = runner.local_backups()
    last_success_at = runner.as_utc(success.started_at) if success else None
    return BackupOverview(
        enabled=row.enabled,
        enabled_at=runner.as_utc(row.enabled_at),
        schedule_mode=row.schedule_mode,
        daily_time=row.daily_time,
        schedule_timezone=row.schedule_timezone,
        interval_hours=row.interval_hours,
        keep_daily=row.keep_daily,
        keep_weekly=row.keep_weekly,
        keep_monthly=row.keep_monthly,
        notify_on_failure=row.notify_on_failure,
        key_fingerprint=row.key_fingerprint,
        key_created_at=runner.as_utc(row.key_created_at),
        scheduler_mode=settings.backup_scheduler,
        last_scheduler_check_at=runner.as_utc(row.last_scheduler_check_at),
        scheduler_note=runner.scheduler_note(row, settings.backup_scheduler, now) if row.enabled else None,
        backup_dir=str(paths.backup_dir()),
        local_count=len(files),
        local_bytes=sum(p.stat().st_size for p in files),
        last_success_at=last_success_at,
        overdue=row.enabled and schedule.is_overdue(
            now, row.schedule_mode, row.interval_hours, last_success_at, runner.as_utc(row.enabled_at)),
        running=runner.backup_in_progress(),
    )


@router.put("/settings", response_model=BackupOverview)
async def update_settings(body: BackupSettingsUpdate, db: AsyncSession = Depends(get_db),
                          admin: User = Depends(get_admin_user)):
    row = await runner.get_settings(db)
    if body.enabled and not row.key_recipient:
        raise HTTPException(400, "Set a backup passphrase before turning backups on.")
    if body.enabled and not row.enabled:
        row.enabled_at = runner.utcnow()
        row.overdue_alert_sent_at = None
    for field, value in body.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    logger.info("BACKUP", f"Backup settings changed by {admin.callsign or admin.email}")
    return await get_overview(db, admin)


# ========== ENCRYPTION KEY ==========

@router.post("/key", response_model=BackupOverview)
async def set_key(body: BackupKeyRequest, db: AsyncSession = Depends(get_db),
                  admin: User = Depends(get_admin_user)):
    """Create the backup key, change its passphrase, or replace it.

    The passphrase is used here and discarded; it is never stored. Keys are
    wrapped with scrypt, which is deliberately slow, so this runs in a thread.
    """
    row = await runner.get_settings(db)
    try:
        action = await asyncio.to_thread(runner.set_passphrase, row, body.passphrase,
                                         body.current_passphrase, body.replace)
    except (keys.BadPassphrase, ValueError) as exc:
        raise HTTPException(400, str(exc))
    await db.commit()
    # Keep the (re)wrapped key beside the backups straight away, not only at
    # the next backup. An old key's file stays: older backups still need it.
    runner.write_key_file(row)
    logger.info("BACKUP", f"{admin.callsign or admin.email} {action} ({row.key_fingerprint})")
    return await get_overview(db, admin)


@router.get("/key/file")
async def download_key_file(db: AsyncSession = Depends(get_db), _admin: User = Depends(get_admin_user)):
    """The passphrase-protected key file, to keep with an offline copy."""
    row = await runner.get_settings(db)
    if not row.key_wrapped_identity:
        raise HTTPException(404, "No backup key has been set.")
    return Response(
        content=base64.b64decode(row.key_wrapped_identity),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{keys.key_filename(row.key_fingerprint)}"'},
    )


# ========== RUNS ==========

def _run_response(run: BackupRun) -> BackupRunResponse:
    results = [BackupTargetResult(**r) for r in json.loads(run.target_results or "[]")]
    return BackupRunResponse(
        id=run.id, trigger=run.trigger,
        triggered_by_callsign=run.triggered_by.callsign if run.triggered_by else None,
        status=run.status, started_at=runner.as_utc(run.started_at),
        finished_at=runner.as_utc(run.finished_at), filename=run.filename,
        size_bytes=run.size_bytes, key_fingerprint=run.key_fingerprint,
        target_results=results, error=run.error, verified_at=runner.as_utc(run.verified_at),
        verify_ok=run.verify_ok, verify_detail=run.verify_detail,
        file_available=bool(run.filename) and (paths.backup_dir() / run.filename).is_file(),
    )


async def _get_run(db: AsyncSession, run_id: int) -> BackupRun:
    run = (await db.execute(
        select(BackupRun).options(selectinload(BackupRun.triggered_by)).where(BackupRun.id == run_id)
    )).scalar_one_or_none()
    if run is None:
        raise HTTPException(404, "Backup not found")
    return run


def _available_file(run: BackupRun) -> Path:
    path = paths.backup_dir() / (run.filename or "")
    if not run.filename or not path.is_file():
        raise HTTPException(410, "That backup is no longer on this server.")
    return path


@router.get("/runs", response_model=List[BackupRunResponse])
async def list_runs(limit: int = 30, db: AsyncSession = Depends(get_db),
                    _admin: User = Depends(get_admin_user)):
    runs = (await db.execute(
        select(BackupRun).options(selectinload(BackupRun.triggered_by))
        .order_by(BackupRun.started_at.desc(), BackupRun.id.desc()).limit(min(max(limit, 1), 200))
    )).scalars().all()
    return [_run_response(r) for r in runs]


@router.post("/run", status_code=202)
async def run_now(db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    """Start a backup in the background; the history shows it as running."""
    row = await runner.get_settings(db)
    if not row.key_recipient:
        raise HTTPException(400, "Set a backup passphrase first.")
    if runner.backup_in_progress():
        raise HTTPException(409, "A backup is already running.")
    await process.start_detached("run", "--trigger", "manual", "--user-id", str(admin.id))
    return {"started": True}


@router.post("/runs/{run_id}/verify", response_model=BackupRunResponse)
async def verify_run(run_id: int, body: BackupPassphrase, db: AsyncSession = Depends(get_db),
                     _admin: User = Depends(get_admin_user)):
    """Decrypt a backup on the server and check every file in it. Needs the
    passphrase, which is passed to the checker on stdin and not kept."""
    run = await _get_run(db, run_id)
    _available_file(run)
    await process.run_and_wait("verify", "--run-id", str(run_id), stdin_text=body.passphrase)
    await db.refresh(run)
    return _run_response(await _get_run(db, run_id))


@router.post("/runs/{run_id}/download")
async def download_run(run_id: int, body: BackupDownloadRequest, request: Request,
                       db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    """The encrypted backup file. It is the whole database, so it takes a
    fresh two-factor code, and every admin is told it happened."""
    secret = decrypt_mfa_secret(admin.mfa_secret_encrypted) if admin.mfa_secret_encrypted else None
    if not secret or not verify_totp_code(secret, body.mfa_code):
        raise HTTPException(403, "That two-factor code is not valid.")
    run = await _get_run(db, run_id)
    path = _available_file(run)
    who = admin.callsign or admin.email
    ip = get_client_ip(request)
    logger.info("BACKUP", f"{who} downloaded {run.filename}", ip=ip)
    await EmailService.send_backup_downloaded(await runner.admin_emails(db), who, run.filename, ip)
    return FileResponse(path, media_type="application/octet-stream", filename=run.filename)


# ========== TARGETS ==========

def _config_of(target: BackupTarget) -> dict:
    return json.loads(target.config_json or "{}")


async def _last_results(db: AsyncSession) -> dict:
    """Most recent result per target, from the newest run that tried any."""
    runs = (await db.execute(
        select(BackupRun).where(BackupRun.target_results.isnot(None))
        .order_by(BackupRun.id.desc()).limit(20)
    )).scalars().all()
    latest = {}
    for run in runs:
        for result in json.loads(run.target_results or "[]"):
            latest.setdefault(result.get("target_id"), result)
    return latest


def _target_response(target: BackupTarget, last: Optional[dict]) -> BackupTargetResponse:
    config = _config_of(target)
    public_key = None
    if target.kind == "sftp":
        private = decrypt_secret(target.secret_encrypted)
        public_key = f"{public_key_of(private)} ectlogger-backup" if private else None
    return BackupTargetResponse(
        id=target.id, name=target.name, kind=target.kind, enabled=target.enabled,
        prune_enabled=target.prune_enabled,
        **{k: config.get(k) for k in SFTP_FIELDS + S3_FIELDS},
        has_secret=bool(target.secret_encrypted),
        public_key=public_key,
        host_key_fingerprint=host_key_fingerprint(target.trusted_host_key) if target.trusted_host_key else None,
        last_result=BackupTargetResult(**last) if last else None,
    )


async def _get_target(db: AsyncSession, target_id: int) -> BackupTarget:
    target = await db.get(BackupTarget, target_id)
    if target is None:
        raise HTTPException(404, "Target not found")
    return target


def _apply_config(target: BackupTarget, body) -> None:
    fields = SFTP_FIELDS if target.kind == "sftp" else S3_FIELDS
    config = {k: getattr(body, k) for k in fields}
    if target.kind == "sftp":
        config["port"] = config.get("port") or 22
        previous = _config_of(target)
        # A different server is a different host key: trust must be re-given.
        if previous and (previous.get("host"), previous.get("port")) != (config["host"], config["port"]):
            target.trusted_host_key = None
    target.config_json = json.dumps(config)
    target.name = body.name
    target.enabled = body.enabled
    target.prune_enabled = body.prune_enabled


@router.get("/targets", response_model=List[BackupTargetResponse])
async def list_targets(db: AsyncSession = Depends(get_db), _admin: User = Depends(get_admin_user)):
    targets = (await db.execute(select(BackupTarget).order_by(BackupTarget.id))).scalars().all()
    last = await _last_results(db)
    return [_target_response(t, last.get(t.id)) for t in targets]


@router.post("/targets", response_model=BackupTargetResponse, status_code=201)
async def create_target(body: BackupTargetCreate, db: AsyncSession = Depends(get_db),
                        admin: User = Depends(get_admin_user)):
    """SFTP targets get a fresh key pair; the response carries its public key."""
    target = BackupTarget(kind=body.kind)
    _apply_config(target, body)
    if body.kind == "sftp":
        private, _public = generate_ssh_keypair("ectlogger-backup")
        target.secret_encrypted = encrypt_secret(private)
    else:
        target.secret_encrypted = encrypt_secret(body.secret_access_key)
    db.add(target)
    await db.commit()
    await db.refresh(target)
    logger.info("BACKUP", f"{admin.callsign or admin.email} added backup target {target.name}")
    return _target_response(target, None)


@router.put("/targets/{target_id}", response_model=BackupTargetResponse)
async def update_target(target_id: int, body: BackupTargetUpdate, db: AsyncSession = Depends(get_db),
                        _admin: User = Depends(get_admin_user)):
    target = await _get_target(db, target_id)
    _apply_config(target, body)
    if target.kind == "s3" and body.secret_access_key:
        target.secret_encrypted = encrypt_secret(body.secret_access_key)
    await db.commit()
    return _target_response(target, (await _last_results(db)).get(target.id))


@router.delete("/targets/{target_id}", status_code=204)
async def delete_target(target_id: int, db: AsyncSession = Depends(get_db),
                        admin: User = Depends(get_admin_user)):
    target = await _get_target(db, target_id)
    await db.delete(target)
    await db.commit()
    logger.info("BACKUP", f"{admin.callsign or admin.email} removed backup target {target.name}")


@router.post("/targets/{target_id}/regenerate-key", response_model=BackupTargetResponse)
async def regenerate_target_key(target_id: int, db: AsyncSession = Depends(get_db),
                                _admin: User = Depends(get_admin_user)):
    target = await _get_target(db, target_id)
    if target.kind != "sftp":
        raise HTTPException(400, "Only SFTP targets have a key pair.")
    private, _public = generate_ssh_keypair("ectlogger-backup")
    target.secret_encrypted = encrypt_secret(private)
    await db.commit()
    return _target_response(target, None)


@router.post("/targets/{target_id}/test", response_model=BackupTargetTestResult)
async def test_target(target_id: int, db: AsyncSession = Depends(get_db),
                      _admin: User = Depends(get_admin_user)):
    """Connect and open the folder or bucket, without uploading anything."""
    target = await _get_target(db, target_id)

    def check():
        handle = open_target(target.kind, target.config_json, target.secret_encrypted,
                             target.trusted_host_key)
        try:
            return handle.check()
        finally:
            handle.close()

    try:
        message = await asyncio.wait_for(asyncio.to_thread(check), timeout=60)
    except UntrustedHostKey as exc:
        return BackupTargetTestResult(ok=False, message=str(exc), host_key=exc.host_key,
                                      host_key_fingerprint=exc.fingerprint, host_key_changed=exc.changed)
    except (TargetError, KeyError, OSError) as exc:
        return BackupTargetTestResult(ok=False, message=str(exc))
    except asyncio.TimeoutError:
        return BackupTargetTestResult(ok=False, message="Timed out connecting.")
    return BackupTargetTestResult(ok=True, message=message)


@router.post("/targets/{target_id}/trust-host-key", response_model=BackupTargetResponse)
async def trust_host_key(target_id: int, body: BackupTrustHostKey, db: AsyncSession = Depends(get_db),
                         admin: User = Depends(get_admin_user)):
    target = await _get_target(db, target_id)
    if target.kind != "sftp":
        raise HTTPException(400, "Only SFTP targets have a host key.")
    parts = body.host_key.split()
    try:
        fingerprint = host_key_fingerprint(body.host_key)
    except Exception:
        raise HTTPException(400, "That is not a host key.")
    target.trusted_host_key = f"{parts[0]} {parts[1]}"
    await db.commit()
    logger.info("BACKUP", f"{admin.callsign or admin.email} trusted host key {fingerprint} for {target.name}")
    return _target_response(target, (await _last_results(db)).get(target.id))
