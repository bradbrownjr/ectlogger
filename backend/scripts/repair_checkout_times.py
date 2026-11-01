"""One-off repair: put back the check-out times the old check-out code lost.

Until 2026-10-31, routers/check_ins.py::update_check_in did two things wrong
when net control set a station to Checked out:
- it stamped every other row of that callsign with the current time, so a
  row already out (from a move to another place, or an earlier check-out)
  had its real time overwritten. Net 137's W1MTW read as being at Windham
  High School until the final 11:57 check-out, though he left at 09:38.
- it never gave the row that was clicked a time at all.

Each of those events left a system chat line with its own time:
- "W1MTW is now checked out" (a status check-out), and
- "... (checked out of Windham High School) ..." (a move, posted when the
  station was logged somewhere new; the old rows went out at the new row's
  check-in time).

This replays those events per station and corrects checked_out_at on rows
already marked Checked out. It only ever fills a blank time or moves a time
earlier, never later. A station put back on the air while it had no live row
("is now checked in" after a check-out) is skipped, since the chat doesn't say
which row came back, and listed for a person to look at.

Plain sqlite3, no app imports, so it runs on any host's Python.

Usage (from the backend directory):
    python scripts/repair_checkout_times.py ectlogger.db            # dry run
    python scripts/repair_checkout_times.py ectlogger.db --apply    # back up, then write
"""
import argparse
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

# A move's chat line comes from the same request that created the new row
MOVE_MATCH_SECONDS = 5
STATUS_LINE = re.compile(r"^(\S+) is now (.+)$")


def parse(value):
    if not value:
        return None
    return datetime.fromisoformat(str(value).split(".")[0])


def load(conn):
    rows = defaultdict(list)
    for r in conn.execute(
        "SELECT id, net_id, callsign, status, checked_in_at, checked_out_at FROM check_ins "
        "ORDER BY net_id, callsign, checked_in_at, id"
    ):
        rows[(r[1], (r[2] or "").upper())].append(
            {"id": r[0], "status": r[3], "in": parse(r[4]), "out": parse(r[5])}
        )
    events = defaultdict(list)
    for net_id, created_at, message in conn.execute(
        "SELECT net_id, created_at, message FROM chat_messages WHERE is_system = 1 "
        "AND (message LIKE '% is now %' OR message LIKE '%(checked out of %')"
    ):
        callsign = message.split(" ", 1)[0].upper()
        at = parse(created_at)
        if "(checked out of " in message:
            events[(net_id, callsign)].append((at, "move"))
            continue
        m = STATUS_LINE.match(message)
        if not m or m.group(2).startswith("monitoring "):
            continue
        events[(net_id, callsign)].append((at, "out" if m.group(2) == "checked out" else "status"))
    return rows, events


def plan(rows, events):
    """[(net_id, callsign, row_id, checked_in_at, old, new)], [skipped stations]"""
    changes, skipped = [], []
    for key, station_rows in rows.items():
        evs = sorted(events.get(key, []))
        if not any(kind == "out" for _, kind in evs):
            continue  # never set to Checked out, so nothing was restamped
        moves = [at for at, kind in evs if kind == "move"]
        timeline = [(r["in"], 0, "row", r) for r in station_rows if r["in"]]
        timeline += [(at, 1, kind, None) for at, kind in evs if kind != "move"]
        timeline.sort(key=lambda t: (t[0], t[1]))
        live, went_out, ambiguous = [], {}, False
        for at, _, kind, row in timeline:
            if kind == "row":
                if any(abs((m - at).total_seconds()) <= MOVE_MATCH_SECONDS for m in moves):
                    for r in live:
                        went_out[r["id"]] = at
                    live = []
                live.append(row)
            elif kind == "out":
                for r in live:
                    went_out[r["id"]] = at
                live = []
            elif not live:
                ambiguous = True
        proposed = []
        for r in station_rows:
            new = went_out.get(r["id"])
            if r["status"] != "CHECKED_OUT" or new is None or new == r["out"]:
                continue
            if r["out"] is not None and new > r["out"]:
                continue  # never move a time later
            proposed.append((key[0], key[1], r["id"], r["in"], r["out"], new))
        if proposed and ambiguous:
            skipped.append(key)
            continue
        changes.extend(proposed)
    return changes, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("db")
    parser.add_argument("--apply", action="store_true", help="back up the database, then write")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    changes, skipped = plan(*load(conn))
    print(f"{len(changes)} rows across {len({(c[0], c[1]) for c in changes})} stations "
          f"on {len({c[0] for c in changes})} nets")
    for net_id, callsign, row_id, checked_in, old, new in changes:
        print(f"  net {net_id:>4} {callsign:<10} row {row_id:>5}  in {checked_in}  out {old} -> {new}")
    for net_id, callsign in skipped:
        print(f"  skipped net {net_id} {callsign}: put back on the air with no live row; check by hand")

    if not args.apply or not changes:
        print("Dry run; nothing written." if not args.apply else "Nothing to write.")
        return
    backup_path = f"{args.db}.bak-checkout-repair-{datetime.now():%Y%m%d%H%M%S}"
    with sqlite3.connect(backup_path) as backup:
        conn.backup(backup)
    print(f"Backed up to {backup_path}")
    with conn:
        for _, _, row_id, _, _, new in changes:
            conn.execute(
                "UPDATE check_ins SET checked_out_at = ? WHERE id = ? AND status = 'CHECKED_OUT'",
                (new.strftime("%Y-%m-%d %H:%M:%S.%f"), row_id),
            )
    print(f"Wrote {len(changes)} rows.")


if __name__ == "__main__":
    sys.exit(main())
