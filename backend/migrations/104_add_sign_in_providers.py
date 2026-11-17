"""
Migration 104: sign in with Google, Microsoft or another OpenID Connect provider

Changes:
  sign_in_providers
      - one row per provider an admin sets up in Admin > Security.
  user_identities
      - one row per provider account linked to an ECTLogger account.
  provider_sign_in_codes
      - short-lived single-use codes that carry a sign-in or a link request
        between the browser and the provider without putting a token in a URL.

Additive. Safe to re-run. Run after migration 103 and a database backup.
"""
import os
import sqlite3
import sys

TABLES = {
    "sign_in_providers": """
        CREATE TABLE sign_in_providers (
            id INTEGER PRIMARY KEY,
            slug VARCHAR(40) NOT NULL UNIQUE,
            kind VARCHAR(20) NOT NULL,
            label VARCHAR(60) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 0,
            client_id VARCHAR(255) NOT NULL,
            client_secret_encrypted TEXT,
            issuer_url VARCHAR(255),
            microsoft_tenant VARCHAR(64),
            allowed_domains TEXT,
            allow_signup BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "user_identities": """
        CREATE TABLE user_identities (
            id INTEGER PRIMARY KEY,
            provider_id INTEGER NOT NULL REFERENCES sign_in_providers(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject VARCHAR(255) NOT NULL,
            email_at_link VARCHAR(255),
            linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME,
            CONSTRAINT uq_user_identity_provider_subject UNIQUE (provider_id, subject)
        )
    """,
    "provider_sign_in_codes": """
        CREATE TABLE provider_sign_in_codes (
            id INTEGER PRIMARY KEY,
            code_hash VARCHAR(64) NOT NULL UNIQUE,
            purpose VARCHAR(10) NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider_id INTEGER REFERENCES sign_in_providers(id) ON DELETE CASCADE,
            login_status VARCHAR(30),
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME
        )
    """,
}

INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_sign_in_providers_id ON sign_in_providers (id)",
    "CREATE INDEX IF NOT EXISTS ix_sign_in_providers_slug ON sign_in_providers (slug)",
    "CREATE INDEX IF NOT EXISTS ix_user_identities_id ON user_identities (id)",
    "CREATE INDEX IF NOT EXISTS ix_user_identities_provider_id ON user_identities (provider_id)",
    "CREATE INDEX IF NOT EXISTS ix_user_identities_user_id ON user_identities (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_provider_sign_in_codes_id ON provider_sign_in_codes (id)",
    "CREATE INDEX IF NOT EXISTS ix_provider_sign_in_codes_code_hash ON provider_sign_in_codes (code_hash)",
    "CREATE INDEX IF NOT EXISTS ix_provider_sign_in_codes_user_id ON provider_sign_in_codes (user_id)",
]


def migrate(db_path: str = None):
    if db_path is None:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'ectlogger.db')

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        tables = {row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for name, ddl in TABLES.items():
            if name in tables:
                print(f"Table {name} already exists. Skipping.")
            else:
                cursor.execute(ddl)
                print(f"Created table {name}.")
        for ddl in INDEXES:
            cursor.execute(ddl)
        conn.commit()
        print("Migration 104 complete.")
    except Exception as e:
        conn.rollback()
        print(f"Migration 104 failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else None)
