"""Background loop in the web service: the overdue alert, and with
BACKUP_SCHEDULER=internal the schedule itself.

The overdue check lives here rather than in the cron job on purpose. A
missing or broken cron entry is one of the ways backups stop, and a check
that ran from cron would stop with it.
"""
import asyncio

from app.backup import process, runner
from app.config import settings
from app.database import AsyncSessionLocal
from app.logger import logger

CHECK_INTERVAL_SECONDS = 15 * 60


class BackupMonitorService:
    def __init__(self):
        self._task = None

    async def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._run_loop())
            logger.info("BACKUP", f"Backup monitor started (scheduler: {settings.backup_scheduler})")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run_loop(self):
        # Give the service a minute to settle after a restart/deploy first.
        await asyncio.sleep(60)
        while True:
            try:
                await self.tick()
            except Exception as exc:
                logger.error("BACKUP", f"Backup monitor error: {exc}")
            await asyncio.sleep(CHECK_INTERVAL_SECONDS)

    async def tick(self):
        if settings.backup_scheduler == "internal":
            code, output = await process.run_and_wait("run-if-due", timeout=3 * 3600)
            if output:
                logger.info("BACKUP", output)
        async with AsyncSessionLocal() as db:
            await runner.check_overdue(db, settings.backup_scheduler)


backup_monitor_service = BackupMonitorService()
