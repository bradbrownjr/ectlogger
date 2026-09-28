"""Starting scripts/backup.py from the web service.

The web service never builds, uploads or decrypts a backup in its own
process; it starts the command-line tool and records nothing itself, so the
admin panel and cron share one code path and one lock.
"""
import asyncio
import sys
from typing import Optional

from app.backup import paths

CLI = paths.BACKEND_DIR / "scripts" / "backup.py"


def log_path():
    return paths.ensure_private_dir(paths.backup_dir()) / "backup.log"


async def start_detached(*args: str) -> None:
    """Start a backup command and return without waiting for it."""
    log = open(log_path(), "ab")
    try:
        await asyncio.create_subprocess_exec(
            sys.executable, str(CLI), *args,
            cwd=str(paths.BACKEND_DIR), stdin=asyncio.subprocess.DEVNULL,
            stdout=log, stderr=log, start_new_session=True,
        )
    finally:
        log.close()  # the child keeps its own copy of the descriptor


async def run_and_wait(*args: str, stdin_text: Optional[str] = None,
                       timeout: float = 900) -> tuple[int, str]:
    """Run a backup command to completion; returns (exit code, output)."""
    proc = await asyncio.create_subprocess_exec(
        sys.executable, str(CLI), *args,
        cwd=str(paths.BACKEND_DIR), stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        out, _ = await asyncio.wait_for(
            proc.communicate((stdin_text + "\n").encode() if stdin_text is not None else None),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return 124, "Timed out."
    return proc.returncode, out.decode(errors="replace").strip()
