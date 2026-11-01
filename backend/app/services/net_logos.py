"""Net and schedule logos: the shared library, reuse, and file clean-up.

A logo file is named after its contents (utils.save_resized_logo) and can be
pointed at by any number of nets and schedules: every net made from a
schedule starts with the schedule's, and a manager can pick any logo already
on the site instead of uploading it again (Brad, 2026-11-01, for net 137).
So nothing here ever writes over a logo file, and a file is deleted only when
no net or schedule points at it any more (release_logo).

The library lists every logo in use, whoever manages it. These images are
already public on every net and schedule card, and a team's logo often sits
on a schedule the person setting up a one-off net doesn't manage.
"""
import hashlib
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Net, NetTemplate, User
from app.permissions import check_template_permission, load_net_access, may_edit_net
from app.utils import NET_LOGO_DIR

LOGO_URL_PREFIX = "/api/net-logos/"


def logo_url_for(path: Path) -> str:
    return f"{LOGO_URL_PREFIX}{path.name}"


def logo_path(logo_url: Optional[str]) -> Optional[Path]:
    """The file a stored logo_url points at, or None for anything that is
    not a plain file name under NET_LOGO_DIR (a crafted "../" included)."""
    if not logo_url or not logo_url.startswith(LOGO_URL_PREFIX):
        return None
    name = logo_url[len(LOGO_URL_PREFIX):]
    if not name or Path(name).name != name:
        return None
    return NET_LOGO_DIR / name


async def logo_in_use(db: AsyncSession, logo_url: str) -> bool:
    net_hit = (await db.execute(
        select(Net.id).where(Net.logo_url == logo_url).limit(1)
    )).first()
    if net_hit:
        return True
    template_hit = (await db.execute(
        select(NetTemplate.id).where(NetTemplate.logo_url == logo_url).limit(1)
    )).first()
    return template_hit is not None


async def release_logo(db: AsyncSession, logo_url: Optional[str]) -> None:
    """Delete a logo's file once nothing points at it. Call after the change
    that dropped the reference has been flushed or committed."""
    path = logo_path(logo_url)
    if path is None or await logo_in_use(db, logo_url):
        return
    try:
        path.unlink()
    except FileNotFoundError:
        pass


async def release_logos(db: AsyncSession, logo_urls: Iterable[Optional[str]]) -> None:
    for url in set(u for u in logo_urls if u):
        await release_logo(db, url)


def _file_digest(path: Path) -> Optional[str]:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


async def logo_library(db: AsyncSession) -> List[Dict]:
    """Every logo some net or schedule uses, one entry per distinct image.

    Files saved before content naming (``template-11.jpg``, ``net-81.png``)
    can hold the same image under two names, so entries are grouped by the
    file's bytes, not its URL. Each entry is labelled with the schedules
    using it first, then any net that uses it without a schedule doing so.
    """
    template_rows = (await db.execute(
        select(NetTemplate.logo_url, NetTemplate.name)
        .where(NetTemplate.logo_url.is_not(None))
        .order_by(NetTemplate.name)
    )).all()
    net_rows = (await db.execute(
        select(Net.logo_url, Net.name)
        .where(Net.logo_url.is_not(None))
        .order_by(Net.id.desc())
    )).all()

    entries: Dict[str, Dict] = {}
    digest_for_url: Dict[str, Optional[str]] = {}
    for url, name, from_schedule in (
        [(u, n, True) for u, n in template_rows] + [(u, n, False) for u, n in net_rows]
    ):
        if url not in digest_for_url:
            path = logo_path(url)
            digest_for_url[url] = _file_digest(path) if path else None
        digest = digest_for_url[url]
        if digest is None:
            continue  # missing file: nothing to show or reuse
        entry = entries.setdefault(digest, {"logo_url": url, "schedules": [], "nets": []})
        bucket = entry["schedules"] if from_schedule else entry["nets"]
        if name and name not in bucket:
            bucket.append(name)

    result = []
    for entry in entries.values():
        labels = entry["schedules"] + [n for n in entry["nets"] if n not in entry["schedules"]]
        result.append({"logo_url": entry["logo_url"], "used_by": labels})
    result.sort(key=lambda e: (e["used_by"][0].lower() if e["used_by"] else ""))
    return result


async def editable_uses(
    db: AsyncSession,
    user: User,
    logo_url: str,
    exclude_net_ids: Sequence[int] = (),
    exclude_template_ids: Sequence[int] = (),
) -> Dict[str, List]:
    """The nets and schedules *user* may change that show *logo_url*, for
    "also update these" after the user replaced it on one of them."""
    nets = (await db.execute(
        select(Net).where(Net.logo_url == logo_url).order_by(Net.id.desc())
    )).scalars().all()
    nets = [n for n in nets if n.id not in set(exclude_net_ids)]
    access = await load_net_access(db, user, nets)
    editable_nets = [n for n in nets if may_edit_net(access[n.id])]

    templates = (await db.execute(
        select(NetTemplate).where(NetTemplate.logo_url == logo_url).order_by(NetTemplate.name)
    )).scalars().all()
    editable_templates = [
        t for t in templates
        if t.id not in set(exclude_template_ids) and await check_template_permission(db, t, user)
    ]
    return {"nets": editable_nets, "templates": editable_templates}


class LogoPermissionError(Exception):
    pass


async def apply_logo(
    db: AsyncSession,
    user: User,
    logo_url: str,
    net_ids: Sequence[int],
    template_ids: Sequence[int],
) -> List[Optional[str]]:
    """Point every listed net and schedule at *logo_url*, which must already
    be in use. All or nothing: raises LogoPermissionError, changing nothing,
    if the user may not edit any one of them. Returns the logo URLs they
    showed before, for release_logos once the change is committed."""
    nets = (await db.execute(select(Net).where(Net.id.in_(list(net_ids))))).scalars().all() if net_ids else []
    templates = (await db.execute(
        select(NetTemplate).where(NetTemplate.id.in_(list(template_ids)))
    )).scalars().all() if template_ids else []
    if len(nets) != len(set(net_ids)) or len(templates) != len(set(template_ids)):
        raise LookupError("Net or schedule not found")

    access = await load_net_access(db, user, nets)
    if not all(may_edit_net(access[n.id]) for n in nets):
        raise LogoPermissionError()
    for t in templates:
        if not await check_template_permission(db, t, user):
            raise LogoPermissionError()

    previous = [n.logo_url for n in nets] + [t.logo_url for t in templates]
    for entity in [*nets, *templates]:
        entity.logo_url = logo_url
    return previous
