"""
Public RSS feeds: upcoming net schedule and changelog.

Unauthenticated by design -- these are meant to be polled by ordinary RSS
readers, which never send a JWT.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import NetStatus
from app.services.schedule_occurrences import get_occurrences

router = APIRouter(prefix="/feed", tags=["feed"])

RFC822 = "%a, %d %b %Y %H:%M:%S +0000"
CHANGELOG_PATH = Path(__file__).resolve().parents[3] / "frontend" / "src" / "changelog.json"
CHANGELOG_ENTRY_LIMIT = 20
FINISHED_STATUSES = {NetStatus.CLOSED.value, NetStatus.ARCHIVED.value, NetStatus.CANCELLED.value}


def _rss(title: str, link: str, description: str, items: list[str]) -> Response:
    now = datetime.now(timezone.utc).strftime(RFC822)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n<channel>\n'
        f"<title>{escape(title)}</title>\n"
        f"<link>{escape(link)}</link>\n"
        f"<description>{escape(description)}</description>\n"
        f"<lastBuildDate>{now}</lastBuildDate>\n"
        + "\n".join(items)
        + "\n</channel>\n</rss>"
    )
    return Response(content=xml, media_type="application/rss+xml; charset=utf-8")


def _item(title: str, link: str, description: str, pub_date: datetime, guid: str) -> str:
    return (
        "<item>\n"
        f"<title>{escape(title)}</title>\n"
        f"<link>{escape(link)}</link>\n"
        f'<guid isPermaLink="false">{escape(guid)}</guid>\n'
        f"<pubDate>{pub_date.strftime(RFC822)}</pubDate>\n"
        f"<description>{escape(description)}</description>\n"
        "</item>"
    )


@router.get("/schedule.xml")
async def schedule_feed(db: AsyncSession = Depends(get_db)):
    """Upcoming nets in the next 14 days, dated occurrences only (no unscheduled drafts)."""
    now = datetime.utcnow()

    # Same merge of real nets and projections the Schedule page's calendar uses.
    # A feed lists what is still on, so cancelled occurrences and nets already
    # over are left out.
    occurrences = [
        (o.start.replace(tzinfo=None), o.name, o.net_id)
        for o in await get_occurrences(db, now, now + timedelta(days=14), now=now)
        if not o.is_cancelled and o.status not in FINISHED_STATUSES
    ]

    schedule_link = f"{settings.frontend_url}/scheduler"
    items = [
        _item(
            title=name,
            link=schedule_link,
            description=f"{name} - scheduled for {dt.strftime('%A, %B %d, %Y at %H:%M UTC')}",
            pub_date=dt.replace(tzinfo=timezone.utc),
            guid=f"net-{net_id}" if net_id is not None else f"occ-{name}-{dt.isoformat()}",
        )
        for dt, name, net_id in occurrences
    ]

    return _rss(
        title="ECTLogger - Upcoming Net Schedule",
        link=schedule_link,
        description="Upcoming scheduled nets for the next 14 days",
        items=items,
    )


@router.get("/changelog.xml")
async def changelog_feed():
    """Most recent changelog entries, newest first."""
    with open(CHANGELOG_PATH) as f:
        data = json.load(f)

    items = []
    for entry in data.get("entries", [])[:CHANGELOG_ENTRY_LIMIT]:
        entry_date = datetime.strptime(entry["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        parts = []
        for section in entry.get("sections", []):
            parts.append(f"<strong>{escape(section['title'])}</strong><ul>")
            parts.extend(f"<li>{escape(item['text'])}</li>" for item in section.get("items", []))
            parts.append("</ul>")

        items.append(
            _item(
                title=f"ECTLogger {entry['version']}",
                link=settings.frontend_url,
                description="".join(parts),
                pub_date=entry_date,
                guid=f"changelog-{entry['version']}",
            )
        )

    return _rss(
        title="ECTLogger Changelog",
        link=settings.frontend_url,
        description="Latest updates and changes to ECTLogger",
        items=items,
    )
