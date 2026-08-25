"""Realign an NCS rotation's starting point to match the order the team expects.

The operator who lands on the next net is a function of (member order) and
(occurrences elapsed since the rotation's anchor date). Reordering through the
app already re-anchors the rotation, so the next net goes to the new position 1;
this script is the offline equivalent for repairs that have to be done directly
against the database. It writes the same anchor stamp the routes do -- without
it, the new order would be computed against the old anchor and land out of phase.

Usage (from the backend directory):
    python scripts/realign_rotation.py <template_id> <CALLSIGN1> <CALLSIGN2> ...

The callsigns must be exactly the template's current active rotation members,
in the new desired order (position 1 first). Prints before/after and exits
without writing if the callsign set does not match.
"""
import asyncio
import logging
import sys

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

sys.path.insert(0, ".")

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import NetTemplate, NCSRotationMember
from app.routers.ncs_schedule import stamp_rotation_anchor


async def main(template_id: int, desired_order: list[str]):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(NetTemplate)
            .options(selectinload(NetTemplate.rotation_members).selectinload(NCSRotationMember.user))
            .where(NetTemplate.id == template_id)
        )
        tpl = result.scalar_one_or_none()
        if not tpl:
            print(f"Template {template_id} not found.")
            return

        members = sorted(tpl.rotation_members, key=lambda m: m.position)
        by_callsign = {m.user.callsign: m for m in members if m.user}

        print(f"Template {template_id}: {tpl.name}")
        print("  before:", ", ".join(f"{m.position}.{m.user.callsign}" for m in members if m.user))

        current = {m.user.callsign for m in members if m.user}
        if set(desired_order) != current:
            print("  ABORT: desired order does not match current members.")
            print("    current :", sorted(current))
            print("    desired :", sorted(desired_order))
            return

        for i, callsign in enumerate(desired_order, start=1):
            by_callsign[callsign].position = i
        # Same re-anchoring the API routes do, so the new order takes effect on the
        # next occurrence instead of being replayed against the old anchor.
        stamp_rotation_anchor(tpl)
        await db.commit()

        result = await db.execute(
            select(NCSRotationMember)
            .options(selectinload(NCSRotationMember.user))
            .where(NCSRotationMember.template_id == template_id)
            .order_by(NCSRotationMember.position)
        )
        after = result.scalars().all()
        print("  after :", ", ".join(f"{m.position}.{m.user.callsign}" for m in after if m.user))
        print("  done.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(int(sys.argv[1]), sys.argv[2:]))
