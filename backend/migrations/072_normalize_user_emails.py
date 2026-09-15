"""
Migration 072: Normalize existing users.email values to lowercase.

The email column has always been a plain case-sensitive UNIQUE index, and
several write/lookup paths (magic-link request/verify, admin invite) did not
normalize case before this fix -- see app/utils.py::normalize_email and its
call sites. That let the same address register twice differing only in
case (e.g. jim.margetts65@gmail.com vs Jim.Margetts65@gmail.com), each a
fully distinct account with its own login and check-in history.

This migration lowercases every existing row so the unique index behaves as
a case-insensitive one going forward, now that every write path normalizes
on the way in. It is defensive about pre-existing case-duplicate rows: two
rows that already collide once lowercased are left untouched and reported,
since lowercasing one over the other would silently discard whichever
account moves out of the way -- resolve those with an explicit account
merge first, then re-run this migration.
"""

import sqlite3
import os
from collections import defaultdict


def migrate():
    db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id, email FROM users")
        rows = cursor.fetchall()

        by_lower = defaultdict(list)
        for user_id, email in rows:
            by_lower[email.lower()].append((user_id, email))

        collisions = {lower: entries for lower, entries in by_lower.items() if len(entries) > 1}
        if collisions:
            print(f"Found {len(collisions)} email(s) with case-duplicate accounts -- skipping these, resolve manually:")
            for lower, entries in collisions.items():
                print(f"  {lower}: {entries}")

        updated = 0
        for lower, entries in by_lower.items():
            if lower in collisions:
                continue
            user_id, email = entries[0]
            if email != lower:
                cursor.execute("UPDATE users SET email = ? WHERE id = ?", (lower, user_id))
                updated += 1

        conn.commit()
        print(f"Normalized {updated} user email(s) to lowercase.")
        print("Migration 072 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 072 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
