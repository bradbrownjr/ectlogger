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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Net, NetStatus, NetTemplate
from app.routers.ncs_schedule import calculate_schedule_dates, template_local_to_utc

router = APIRouter(prefix="/feed", tags=["feed"])

RFC822 = "%a, %d %b %Y %H:%M:%S +0000"
CHANGELOG_PATH = Path(__file__).resolve().parents[3] / "frontend" / "src" / "changelog.json"
CHANGELOG_ENTRY_LIMIT = 20


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
    window_end = now + timedelta(days=14)

    occurrences: list[tuple[datetime, str, int | None]] = []

    templates_result = await db.execute(
        select(NetTemplate).where(NetTemplate.is_active == True, NetTemplate.schedule_type != "ad_hoc")  # noqa: E712
    )
    for template in templates_result.scalars().all():
        for local_dt in calculate_schedule_dates(template, now, months_ahead=1):
            utc_dt = template_local_to_utc(template, local_dt)
            if utc_dt < now or utc_dt > window_end:
                continue

            slot_start = utc_dt - timedelta(minutes=5)
            slot_end = utc_dt + timedelta(minutes=5)
            existing_result = await db.execute(
                select(Net).where(
                    Net.template_id == template.id,
                    Net.status.notin_([NetStatus.CLOSED, NetStatus.ARCHIVED]),
                    Net.scheduled_start_time >= slot_start,
                    Net.scheduled_start_time <= slot_end,
                )
            )
            existing = existing_result.scalars().first()
            if existing:
                # A materialized Net row is authoritative -- reflects renames and
                # lets a CANCELLED occurrence drop out of the feed entirely.
                if existing.status == NetStatus.CANCELLED:
                    continue
                occurrences.append((existing.scheduled_start_time, existing.name, existing.id))
            else:
                occurrences.append((utc_dt, template.name, None))

    included_net_ids = {net_id for _, _, net_id in occurrences if net_id is not None}

    # Ad hoc nets (and any template-based net not already picked up above) that
    # carry their own scheduled_start_time.
    manual_result = await db.execute(
        select(Net).where(
            Net.status.in_([NetStatus.DRAFT, NetStatus.SCHEDULED]),
            Net.scheduled_start_time.isnot(None),
            Net.scheduled_start_time >= now,
            Net.scheduled_start_time <= window_end,
        )
    )
    for net in manual_result.scalars().all():
        if net.id in included_net_ids:
            continue
        occurrences.append((net.scheduled_start_time, net.name, net.id))

    occurrences.sort(key=lambda o: o[0])

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
