"""
Migration 058: Add app_settings.gravatar_enabled.

Master switch for third-party avatar lookups. When false, no Gravatar URL is
ever handed to a client, so no browser contacts gravatar.com at all -- intended
for self-hosted instances on isolated or privacy-restricted networks (EOC,
hospital, agency). Uploaded profile photos are served locally and are
unaffected; only the third-party lookup is disabled.

Defaults to 1 (enabled) so existing instances keep today's behavior.

Context: this ships alongside the removal of the server-side Gravatar existence
probe in app/utils.py::get_avatar_url, which issued a blocking HTTP HEAD to
gravatar.com for every serialized user. That probe cost ~150-200 ms per user on
all twelve endpoints returning UserResponse -- including /users/me, hit on every
authenticated page load -- and because it used synchronous urllib inside an
async request it stalled the event loop for every other request while it waited.
Gravatar is designed for direct client-side embedding with the `d=` parameter
supplying the fallback, so the probe was doing work the browser already does.
"""

import sqlite3
import os


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(app_settings)")
        existing = {row[1] for row in cursor.fetchall()}

        if 'gravatar_enabled' in existing:
            print("Column gravatar_enabled already exists in app_settings — skipping.")
        else:
            cursor.execute(
                "ALTER TABLE app_settings ADD COLUMN gravatar_enabled BOOLEAN DEFAULT 1"
            )
            # ALTER ... DEFAULT only applies to new rows; app_settings is a
            # singleton that already exists, so set it explicitly.
            cursor.execute(
                "UPDATE app_settings SET gravatar_enabled = 1 WHERE gravatar_enabled IS NULL"
            )
            print("Added gravatar_enabled to app_settings (default enabled).")

        conn.commit()
        print("Migration 058 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 058 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    migrate()
