"""Approximate location of an internet address, for the activity log and
security alerts.

Reads DB-IP's free "IP to City Lite" database from a local file, so no
address ever leaves the server. The file is CC BY 4.0: anything that shows
a location must credit DB-IP with a link (the Activity tab and the alert
emails do; see ATTRIBUTION_HTML). https://db-ip.com/db/download/ip-to-city-lite

The file (~130 MB) is fetched once a month by refresh_database, run from
the activity log's daily job. Without it, lookup returns None and
everything else works as before.
"""
import asyncio
import gzip
import os
import shutil
import tempfile
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from app.config import settings
from app.logger import logger

DOWNLOAD_URL = "https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz"
ATTRIBUTION_HTML = "<a href='https://db-ip.com'>IP Geolocation by DB-IP</a>"
REFRESH_AFTER = timedelta(days=32)

_reader = None
_reader_mtime: Optional[float] = None


def database_path() -> Path:
    if settings.geoip_db_path:
        return Path(settings.geoip_db_path)
    return Path(__file__).resolve().parents[1] / "data" / "geoip" / "dbip-city-lite.mmdb"


def _open_reader():
    """The reader for the current file, reopened when the file is replaced."""
    global _reader, _reader_mtime
    path = database_path()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    if _reader is None or mtime != _reader_mtime:
        import maxminddb
        try:
            _reader = maxminddb.open_database(str(path))
            _reader_mtime = mtime
        except Exception as exc:
            logger.error("GEOIP", f"Could not open {path}: {exc}")
            _reader = None
    return _reader


def lookup(ip: Optional[str]) -> Optional[str]:
    """ "Bedford, New Hampshire, US", or None for a private or unknown
    address, or when there is no database."""
    if not ip:
        return None
    reader = _open_reader()
    if reader is None:
        return None
    try:
        record = reader.get(ip)
    except ValueError:  # not an IP address
        return None
    if not record:
        return None
    city = (record.get("city") or {}).get("names", {}).get("en")
    region = ((record.get("subdivisions") or [{}])[0]).get("names", {}).get("en")
    country = (record.get("country") or {}).get("iso_code")
    parts = [p for p in (city, region, country) if p]
    return ", ".join(dict.fromkeys(parts)) or None


def _download(month: str, dest: Path) -> None:
    """Fetch one month's file into dest, atomically."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False, suffix=".part") as tmp:
        tmp_path = Path(tmp.name)
    try:
        request = urllib.request.Request(DOWNLOAD_URL.format(month=month), headers={"User-Agent": "ECTLogger"})
        with urllib.request.urlopen(request, timeout=300) as response, open(tmp_path, "wb") as out:
            with gzip.GzipFile(fileobj=response) as unzipped:
                shutil.copyfileobj(unzipped, out)
        os.replace(tmp_path, dest)
    finally:
        tmp_path.unlink(missing_ok=True)


async def refresh_database(now: Optional[datetime] = None) -> bool:
    """Download this month's file when there is none or it is over a month
    old. Tries last month's when this month's isn't published yet. Returns
    whether a new file was installed."""
    if not settings.geoip_auto_download:
        return False
    path = database_path()
    now = now or datetime.now(timezone.utc)
    if path.exists() and now - datetime.fromtimestamp(path.stat().st_mtime, timezone.utc) < REFRESH_AFTER:
        return False
    last_month = (now.replace(day=1) - timedelta(days=1))
    for month in (now.strftime("%Y-%m"), last_month.strftime("%Y-%m")):
        try:
            await asyncio.to_thread(_download, month, path)
            logger.info("GEOIP", f"Installed DB-IP City Lite {month} at {path}")
            return True
        except Exception as exc:
            logger.warning("GEOIP", f"DB-IP City Lite {month} not downloaded: {exc}")
    return False
