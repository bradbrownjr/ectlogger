"""Realign an NCS rotation's starting point to match the order the team expects.

The schedule is anchored to a template's first occurrence, so the operator who
lands on the next net is a function of (member order) and (elapsed occurrences).
When a rotation needs to resume from a specific operator (e.g. after the
"perpetual position 1" bug left it stuck), rotating the member list to put that
operator first realigns the whole forward sequence without changing the cycle.

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
