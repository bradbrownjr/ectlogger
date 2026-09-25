from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import AppSettings


# Session length before any admin has saved Session Settings.
DEFAULT_SESSION_LIFETIME_DAYS = 90


async def get_session_config(db: AsyncSession) -> tuple[int, bool]:
    """Return (lifetime_days, rolling_renewal) from the DB app_settings singleton."""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        return DEFAULT_SESSION_LIFETIME_DAYS, True
    lifetime = row.session_lifetime_days if row.session_lifetime_days is not None else DEFAULT_SESSION_LIFETIME_DAYS
    rolling = row.session_rolling_renewal if row.session_rolling_renewal is not None else True
    return lifetime, rolling
