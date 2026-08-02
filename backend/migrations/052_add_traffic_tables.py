"""
Migration 052: Add traffic tables.

Creates form_definitions, form_definition_fields, forms, and
traffic_log_entries — the core Assisted Traffic Handling data model
(radiograms and other formal-traffic forms). See
docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 2 for the full data model
rationale. Definition content (the form schemas themselves) is seeded by the
startup upsert in app/traffic/definitions.py, never by a migration.
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
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='form_definitions'")
        if cursor.fetchone():
            print("Table form_definitions already exists — skipping.")
        else:
            cursor.execute("""
                CREATE TABLE form_definitions (
                    id INTEGER NOT NULL PRIMARY KEY,
                    form_type VARCHAR(32) NOT NULL,
                    title VARCHAR(120) NOT NULL,
                    description TEXT,
                    version VARCHAR(16) NOT NULL,
                    output_format VARCHAR(32) NOT NULL DEFAULT 'generic',
                    is_builtin BOOLEAN DEFAULT 1,
                    is_enabled BOOLEAN DEFAULT 1,
                    sort_order INTEGER DEFAULT 100,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME
                )
            """)
            cursor.execute("CREATE UNIQUE INDEX ix_form_definitions_form_type ON form_definitions (form_type)")
            cursor.execute("CREATE INDEX ix_form_definitions_id ON form_definitions (id)")
            print("Created table form_definitions.")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='form_definition_fields'")
        if cursor.fetchone():
            print("Table form_definition_fields already exists — skipping.")
        else:
            cursor.execute("""
                CREATE TABLE form_definition_fields (
                    id INTEGER NOT NULL PRIMARY KEY,
                    definition_id INTEGER NOT NULL,
                    name VARCHAR(64) NOT NULL,
                    label VARCHAR(120) NOT NULL,
                    field_type VARCHAR(20) NOT NULL DEFAULT 'text',
                    description TEXT,
                    help_text TEXT,
                    is_required BOOLEAN DEFAULT 0,
                    max_length INTEGER,
                    choices TEXT,
                    validator VARCHAR(32),
                    default_now VARCHAR(16),
                    auto_fill VARCHAR(32),
                    nts_normalize BOOLEAN DEFAULT 0,
                    arl_enabled BOOLEAN DEFAULT 0,
                    sort_order INTEGER DEFAULT 100,
                    FOREIGN KEY(definition_id) REFERENCES form_definitions (id) ON DELETE CASCADE,
                    CONSTRAINT uq_form_definition_field_name UNIQUE (definition_id, name)
                )
            """)
            cursor.execute("CREATE INDEX ix_form_definition_fields_id ON form_definition_fields (id)")
            cursor.execute("CREATE INDEX ix_form_definition_fields_definition_id ON form_definition_fields (definition_id)")
            print("Created table form_definition_fields.")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='forms'")
        if cursor.fetchone():
            print("Table forms already exists — skipping.")
        else:
            cursor.execute("""
                CREATE TABLE forms (
                    id INTEGER NOT NULL PRIMARY KEY,
                    definition_id INTEGER NOT NULL,
                    form_type VARCHAR(32) NOT NULL,
                    definition_version VARCHAR(16) NOT NULL,
                    net_id INTEGER,
                    created_by_id INTEGER,
                    field_values TEXT NOT NULL DEFAULT '{}',
                    subject VARCHAR(255),
                    addressee_display VARCHAR(255),
                    message_number VARCHAR(16),
                    precedence VARCHAR(16),
                    handling VARCHAR(32),
                    station_of_origin VARCHAR(20),
                    check_count INTEGER,
                    check_stated INTEGER,
                    normalized_text TEXT,
                    held_by_user_id INTEGER,
                    held_since DATETIME,
                    last_action VARCHAR(20),
                    filed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME,
                    FOREIGN KEY(definition_id) REFERENCES form_definitions (id),
                    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE SET NULL,
                    FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL,
                    FOREIGN KEY(held_by_user_id) REFERENCES users (id) ON DELETE SET NULL
                )
            """)
            cursor.execute("CREATE INDEX ix_forms_id ON forms (id)")
            cursor.execute("CREATE INDEX ix_forms_form_type ON forms (form_type)")
            cursor.execute("CREATE INDEX ix_forms_net_id ON forms (net_id)")
            cursor.execute("CREATE INDEX ix_forms_created_by_id ON forms (created_by_id)")
            cursor.execute("CREATE INDEX ix_forms_message_number ON forms (message_number)")
            cursor.execute("CREATE INDEX ix_forms_precedence ON forms (precedence)")
            cursor.execute("CREATE INDEX ix_forms_station_of_origin ON forms (station_of_origin)")
            cursor.execute("CREATE INDEX ix_forms_held_by_user_id ON forms (held_by_user_id)")
            cursor.execute("CREATE INDEX ix_forms_filed_at ON forms (filed_at)")
            cursor.execute("CREATE INDEX ix_forms_inbox ON forms (held_by_user_id, held_since)")
            cursor.execute("CREATE INDEX ix_forms_net_filed ON forms (net_id, filed_at)")
            print("Created table forms.")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='traffic_log_entries'")
        if cursor.fetchone():
            print("Table traffic_log_entries already exists — skipping.")
        else:
            cursor.execute("""
                CREATE TABLE traffic_log_entries (
                    id INTEGER NOT NULL PRIMARY KEY,
                    form_id INTEGER NOT NULL,
                    sequence INTEGER NOT NULL,
                    action VARCHAR(20) NOT NULL,
                    method VARCHAR(20),
                    method_note VARCHAR(255),
                    path_name VARCHAR(200),
                    handed_to VARCHAR(200),
                    handed_to_user_id INTEGER,
                    reported_by_user_id INTEGER,
                    net_id INTEGER,
                    note TEXT,
                    occurred_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(form_id) REFERENCES forms (id) ON DELETE CASCADE,
                    FOREIGN KEY(handed_to_user_id) REFERENCES users (id) ON DELETE SET NULL,
                    FOREIGN KEY(reported_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
                    FOREIGN KEY(net_id) REFERENCES nets (id) ON DELETE SET NULL,
                    CONSTRAINT uq_traffic_log_form_sequence UNIQUE (form_id, sequence)
                )
            """)
            cursor.execute("CREATE INDEX ix_traffic_log_entries_id ON traffic_log_entries (id)")
            cursor.execute("CREATE INDEX ix_traffic_log_entries_form_id ON traffic_log_entries (form_id)")
            cursor.execute("CREATE INDEX ix_traffic_log_entries_handed_to_user_id ON traffic_log_entries (handed_to_user_id)")
            cursor.execute("CREATE INDEX ix_traffic_log_entries_reported_by_user_id ON traffic_log_entries (reported_by_user_id)")
            cursor.execute("CREATE INDEX ix_traffic_log_entries_net_id ON traffic_log_entries (net_id)")
            print("Created table traffic_log_entries.")

        conn.commit()
        print("Migration 052 complete.")

    except Exception as e:
        conn.rollback()
        print(f"Migration 052 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
