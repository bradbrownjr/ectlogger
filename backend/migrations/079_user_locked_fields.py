"""
Migration 079: One list of admin field locks on User

Adds:
  users.locked_fields - JSON array of profile fields the user's own
                        PUT /users/me can no longer change

Replaces the three per-field booleans from migration 076 (name_locked,
callsign_locked, email_locked): the Edit User dialog now shows and can lock
every profile field (GMRS callsign, additional callsigns, location, spotter
number, website), and one list with one enforcement loop scales where a
boolean column per field did not. Existing locks are carried over, then the
three old columns are dropped.

Safe to re-run: skips the add if locked_fields exists, and skips the copy
and drop if the old columns are already gone.
"""
import json
import os
import sqlite3

OLD_COLUMNS = {"name_locked": "name", "callsign_locked": "callsign", "email_locked": "email"}


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(users)")
        existing = {row[1] for row in cursor.fetchall()}

        if "locked_fields" in existing:
            print("Column locked_fields already exists in users, skipping add.")
        else:
            cursor.execute("ALTER TABLE users ADD COLUMN locked_fields TEXT NOT NULL DEFAULT '[]'")
            print("Added locked_fields to users.")

        present = [col for col in OLD_COLUMNS if col in existing]
        if present:
            cursor.execute(f"SELECT id, {', '.join(present)} FROM users WHERE {' OR '.join(present)}")
            rows = cursor.fetchall()
            for row in rows:
                user_id, flags = row[0], row[1:]
                locked = sorted(OLD_COLUMNS[col] for col, flag in zip(present, flags) if flag)
                cursor.execute("UPDATE users SET locked_fields = ? WHERE id = ?", (json.dumps(locked), user_id))
            print(f"Carried over locks for {len(rows)} user(s).")

            for col in present:
                cursor.execute(f"ALTER TABLE users DROP COLUMN {col}")
                print(f"Dropped {col} from users.")

        conn.commit()
        print("Migration 079 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 079 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
