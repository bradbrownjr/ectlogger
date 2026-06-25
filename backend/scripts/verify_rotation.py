"""Read-only NCS rotation verification.

Compares the anchored rotation computation (get_rotation_anchor_date +
compute_anchored_ncs_schedule) against the NCS actually recorded on each net
created from a template, and prints the next upcoming assignments. Use it to
confirm the rotation-advance fix lands the correct operator and to surface any
historical discrepancies (e.g. nets auto-created with the old position-1 logic).

Run from the backend directory:
    python3 scripts/verify_rotation.py
Makes no writes.
"""
import asyncio
import logging
import sys
from datetime import datetime

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

sys.path.insert(0, ".")

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import (
    NetTemplate, NCSRotationMember, NCSScheduleOverride, Net, NetRole,
)
from app.routers.ncs_rotation import (
    get_rotation_anchor_date, compute_anchored_ncs_schedule,
    calculate_schedule_dates, template_utc_to_local,
)


def _fmt(entry):
    if entry is None:
        return "(no computed entry)"
    if entry.is_cancelled:
        return "CANCELLED"
    tag = " [override]" if entry.is_override else (" [5th wk]" if entry.is_fifth_week else "")
    return f"{entry.user_callsign or '?'} ({entry.user_name or '?'}){tag}"


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(NetTemplate)
            .options(
                selectinload(NetTemplate.rotation_members).selectinload(NCSRotationMember.user),
                selectinload(NetTemplate.schedule_overrides).selectinload(NCSScheduleOverride.replacement_user),
                selectinload(NetTemplate.fifth_week_user),
            )
            .where(NetTemplate.is_active == True)
        )
        templates = result.scalars().all()

        total_mismatches = 0

        for tpl in templates:
            active = sorted([m for m in tpl.rotation_members if m.is_active], key=lambda m: m.position)
            if not active:
                continue

            anchor = get_rotation_anchor_date(tpl)
            print("=" * 78)
            print(f"Template {tpl.id}: {tpl.name}")
            print(f"  schedule_type={tpl.schedule_type}  created_at={tpl.created_at}")
            print(f"  anchor (first occurrence) = {anchor}")
            order = ", ".join(f"{i+1}.{m.user.callsign if m.user else '?'}" for i, m in enumerate(active))
            print(f"  rotation order: {order}")

            # Compare against recorded NCS on existing nets for this template.
            nets_result = await db.execute(
                select(Net)
                .where(Net.template_id == tpl.id, Net.scheduled_start_time.isnot(None))
                .order_by(Net.scheduled_start_time)
            )
            nets = nets_result.scalars().all()

            print("  --- recorded nets vs. anchored computation ---")
            for net in nets:
                role_result = await db.execute(
                    select(NetRole)
                    .options(selectinload(NetRole.user))
                    .where(NetRole.net_id == net.id, NetRole.role == "NCS")
                )
                ncs_roles = role_result.scalars().all()
                recorded = ", ".join(r.user.callsign for r in ncs_roles if r.user) or "(none)"

                local_dt = template_utc_to_local(tpl, net.scheduled_start_time)
                computed = compute_anchored_ncs_schedule(
                    tpl, [local_dt], tpl.rotation_members, tpl.schedule_overrides
                )
                computed_entry = computed[0] if computed else None
                computed_cs = (computed_entry.user_callsign if computed_entry else None) or "(none)"

                # Mismatch only flagged when both sides name someone and they differ.
                flag = ""
                if computed_cs != "(none)" and recorded != "(none)" and computed_cs not in recorded.split(", "):
                    flag = "  <<< MISMATCH"
                    total_mismatches += 1
                print(f"    net {net.id:>5}  {local_dt.date()}  status={net.status.value:<9} "
                      f"recorded={recorded:<10} computed={_fmt(computed_entry)}{flag}")

            # Show the next few upcoming computed assignments.
            start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            upcoming = calculate_schedule_dates(tpl, start, months_ahead=2)[:6]
            sched = compute_anchored_ncs_schedule(
                tpl, upcoming, tpl.rotation_members, tpl.schedule_overrides
            )
            print("  --- next upcoming assignments (anchored) ---")
            for e in sched:
                print(f"    {e.date.date()}  ->  {_fmt(e)}")

        print("=" * 78)
        print(f"Total mismatches (computed vs recorded): {total_mismatches}")


if __name__ == "__main__":
    asyncio.run(main())
