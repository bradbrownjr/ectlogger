"""Which backups to keep: the newest one per day, per week and per month.

Same rule restic's ``forget --keep-daily/--keep-weekly/--keep-monthly`` uses.
Walking newest to oldest, a backup is kept when it is the first one seen in a
day (or ISO week, or month) and that tier still has room. The newest backup is
always kept, whatever the counts are.
"""
from datetime import datetime
from typing import Iterable


def select_to_keep(backups: Iterable[tuple[str, datetime]], daily: int, weekly: int,
                   monthly: int) -> set[str]:
    ordered = sorted(backups, key=lambda item: item[1], reverse=True)
    if not ordered:
        return set()

    tiers = [
        (daily, lambda t: t.date()),
        (weekly, lambda t: t.isocalendar()[:2]),
        (monthly, lambda t: (t.year, t.month)),
    ]
    keep = {ordered[0][0]}
    for limit, bucket_of in tiers:
        seen = set()
        for name, when in ordered:
            if len(seen) >= limit:
                break
            bucket = bucket_of(when)
            if bucket not in seen:
                seen.add(bucket)
                keep.add(name)
    return keep
