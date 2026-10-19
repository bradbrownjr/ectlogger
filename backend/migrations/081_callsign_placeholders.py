"""
Migration 081: Net staff and rotation members by callsign, before they sign up

A schedule's staff list, its NCS rotation, its swaps and its 5th-week pick can
now name an operator who has no account yet, by callsign alone. Such an entry
grants nothing; it becomes an ordinary entry when that operator signs up and
the schedule's manager confirms it (backend/app/services/callsign_people.py).

Changes:
  template_staff.user_id         - now nullable (table rebuilt: SQLite cannot
                                   drop NOT NULL in place)
  template_staff.callsign        - set only while user_id is NULL
  ncs_rotation_members.user_id   - now nullable (table rebuilt)
  ncs_rotation_members.callsign  - set only while user_id is NULL
  ncs_schedule_overrides.original_callsign, .replacement_callsign
  net_templates.fifth_week_callsign
  net_callsign_roles             - new: NCS/Logger/Relay credit on a net for a
                                   station with no account
  callsign_claims                - new: an account taking over (or waiting to
                                   take over) a schedule's entries, so an admin
                                   can undo it
  team_invites                   - new: the sign-up invites managers send

The rebuilds reuse each table's own stored CREATE statement with only
user_id's NOT NULL removed, then recreate its indexes, so every row, id,
constraint, index and AUTOINCREMENT setting survives. Safe to re-run: each
step checks whether it has already been applied. Run after a database backup.
"""
import os
import re
import sqlite3

ADDED_COLUMNS = [
    ("ncs_schedule_overrides", "original_callsign", "VARCHAR(50)"),
    ("ncs_schedule_overrides", "replacement_callsign", "VARCHAR(50)"),
    ("net_templates", "fifth_week_callsign", "VARCHAR(50)"),
]

NEW_TABLES = {
    "net_callsign_roles": """
CREATE TABLE net_callsign_roles (
    id INTEGER NOT NULL,
    net_id INTEGER NOT NULL,
    callsign VARCHAR(50) NOT NULL,
    role VARCHAR(50) NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    auto_assigned BOOLEAN NOT NULL DEFAULT 0,
    assigned_by_id INTEGER,
    PRIMARY KEY (id),
    CONSTRAINT uq_net_callsign_role UNIQUE (net_id, callsign, role),
    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE CASCADE,
    FOREIGN KEY(assigned_by_id) REFERENCES users (id) ON DELETE SET NULL
)""",
    "callsign_claims": """
CREATE TABLE callsign_claims (
    id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    callsign VARCHAR(50) NOT NULL,
    template_id INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'linked',
    rows TEXT NOT NULL DEFAULT '[]',
    via_invite BOOLEAN NOT NULL DEFAULT 0,
    linked_by_id INTEGER,
    claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reverted_at DATETIME,
    reverted_by_id INTEGER,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY(template_id) REFERENCES net_templates (id) ON DELETE CASCADE,
    FOREIGN KEY(linked_by_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY(reverted_by_id) REFERENCES users (id) ON DELETE SET NULL
)""",
    "team_invites": """
CREATE TABLE team_invites (
    id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    callsign VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    invited_by_id INTEGER,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY(template_id) REFERENCES net_templates (id) ON DELETE CASCADE,
    FOREIGN KEY(invited_by_id) REFERENCES users (id) ON DELETE SET NULL
)""",
}

NEW_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_net_callsign_roles_id ON net_callsign_roles (id)",
    "CREATE INDEX IF NOT EXISTS ix_net_callsign_roles_net_id ON net_callsign_roles (net_id)",
    "CREATE INDEX IF NOT EXISTS ix_callsign_claims_id ON callsign_claims (id)",
    "CREATE INDEX IF NOT EXISTS ix_callsign_claims_user_id ON callsign_claims (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_callsign_claims_callsign ON callsign_claims (callsign)",
    "CREATE INDEX IF NOT EXISTS ix_callsign_claims_template_id ON callsign_claims (template_id)",
    "CREATE INDEX IF NOT EXISTS ix_team_invites_id ON team_invites (id)",
    "CREATE INDEX IF NOT EXISTS ix_team_invites_template_id ON team_invites (template_id)",
    "CREATE INDEX IF NOT EXISTS ix_team_invites_callsign ON team_invites (callsign)",
    "CREATE INDEX IF NOT EXISTS ix_team_invites_email ON team_invites (email)",
    "CREATE INDEX IF NOT EXISTS ix_team_invites_invited_by_id ON team_invites (invited_by_id)",
    "CREATE INDEX IF NOT EXISTS ix_team_invites_sent_at ON team_invites (sent_at)",
]


def _columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1]: row for row in cursor.fetchall()}


_NOT_NULL_USER_ID = re.compile(r'(\buser_id"?\s+INTEGER)\s+NOT\s+NULL', re.IGNORECASE)


def _rebuild_nullable_user(cursor, table):
    """Recreate `table` with a nullable user_id, keeping every row, and add a
    callsign column. Built from the table's own stored CREATE statement, so
    whatever constraints, AUTOINCREMENT and indexes it has survive. Skipped
    once user_id is already nullable."""
    cols = _columns(cursor, table)
    if not cols:
        print(f"{table} does not exist, skipping (create_all builds it on start).")
        return
    # PRAGMA table_info: (cid, name, type, notnull, dflt_value, pk)
    if cols["user_id"][3] == 1:
        create_sql = cursor.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        ).fetchone()[0]
        new_sql, replaced = _NOT_NULL_USER_ID.subn(r"\1", create_sql)
        if replaced != 1:
            raise RuntimeError(f"{table}: couldn't find 'user_id INTEGER NOT NULL' in {create_sql!r}")
        index_sqls = [row[0] for row in cursor.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL", (table,)
        ).fetchall()]
        column_list = ", ".join(cols)
        before = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        cursor.execute(f"ALTER TABLE {table} RENAME TO {table}_old_081")
        cursor.execute(new_sql)
        cursor.execute(f"INSERT INTO {table} ({column_list}) SELECT {column_list} FROM {table}_old_081")
        after = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if before != after:
            raise RuntimeError(f"{table}: copied {after} of {before} rows")
        cursor.execute(f"DROP TABLE {table}_old_081")
        for index_sql in index_sqls:
            cursor.execute(index_sql)
        print(f"Rebuilt {table} with a nullable user_id ({after} rows, {len(index_sqls)} indexes kept).")
    else:
        print(f"{table}.user_id is already nullable, skipping the rebuild.")
    if "callsign" not in _columns(cursor, table):
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN callsign VARCHAR(50)")
        print(f"Added callsign to {table}.")


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    # Autocommit mode, so the explicit BEGIN below is the one transaction
    # and every step (including the DDL) commits or rolls back together.
    conn = sqlite3.connect(db_path, isolation_level=None)
    # A table rebuild with foreign keys on would cascade-delete child rows
    # when the old table is dropped; nothing references these two tables,
    # but keep it off for the rebuild regardless.
    conn.execute("PRAGMA foreign_keys=OFF")
    cursor = conn.cursor()

    try:
        cursor.execute("BEGIN")
        _rebuild_nullable_user(cursor, "template_staff")
        _rebuild_nullable_user(cursor, "ncs_rotation_members")

        for table, column, column_type in ADDED_COLUMNS:
            cols = _columns(cursor, table)
            if not cols:
                print(f"{table} does not exist, skipping {column}.")
                continue
            if column in cols:
                print(f"Column {column} already exists in {table}, skipping.")
                continue
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
            print(f"Added {column} to {table}.")

        for table, create_sql in NEW_TABLES.items():
            if _columns(cursor, table):
                print(f"Table {table} already exists, skipping.")
                continue
            cursor.execute(create_sql)
            print(f"Created {table}.")
        for statement in NEW_INDEXES:
            cursor.execute(statement)

        # Only the two rebuilt tables; anything reported here was already in
        # the old table (the copy is row-for-row), so it is reported, not fatal.
        for table in ("template_staff", "ncs_rotation_members"):
            problems = cursor.execute(f"PRAGMA foreign_key_check({table})").fetchall()
            if problems:
                print(f"Note: {table} has {len(problems)} row(s) pointing at missing rows (pre-existing): {problems[:5]}")

        cursor.execute("COMMIT")
        print("Migration 081 complete.")

    except Exception as e:
        cursor.execute("ROLLBACK")
        print(f"Migration 081 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
