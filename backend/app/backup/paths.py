"""Where everything a backup reads from and writes to lives on disk.

Kept in one place so the archive builder, the restore command and the API all
agree on what "the instance's files" are.
"""
import os
from pathlib import Path
from typing import Optional

# backend/ -- the directory the service runs from, so a relative SQLite URL
# ("sqlite:///./ectlogger.db") resolves against it.
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent

# Uploaded files: avatars, chat images, instance logo, net/schedule logos.
DATA_DIR = BACKEND_DIR / "data"

# Configuration that is not in version control. SECRET_KEY lives here, and
# every MFA secret in the database is encrypted with a key derived from it, so
# a database restored without its .env loses every admin's two-factor login.
ENV_FILES = {
    "backend.env": BACKEND_DIR / ".env",
    "frontend.env": REPO_DIR / "frontend" / ".env",
}


def backup_dir() -> Path:
    """Local folder that holds finished backups.

    Deliberately set only from the environment (BACKUP_DIR), never from the
    admin panel: a web-editable path would let an admin session write files
    anywhere the service account can.
    """
    from app.config import settings  # lazy: restore runs before a .env exists

    configured = settings.backup_dir
    path = Path(configured) if configured else BACKEND_DIR / "backups"
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path


def sqlite_db_path(database_url: Optional[str] = None) -> Optional[Path]:
    """Filesystem path of the SQLite database, or None for a server database."""
    if database_url is None:
        from app.config import settings  # lazy: restore passes its own URL

        database_url = settings.database_url
    url = database_url
    if not url.startswith("sqlite"):
        return None
    # sqlite:///relative.db, sqlite:////absolute.db, sqlite+aiosqlite:///...
    raw = url.split(":///", 1)[1] if ":///" in url else ""
    if not raw or raw == ":memory:":
        return None
    path = Path(raw)
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


def ensure_private_dir(path: Path) -> Path:
    """Create a directory readable only by the service account."""
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass
    return path
