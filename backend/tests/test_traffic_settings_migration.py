"""
Test for migrations/053_add_traffic_settings.py: adds nets.traffic_enabled
and net_templates.traffic_enabled with the correct default (1 = enabled),
mirroring migration 051's test-free precedent but exercised here since this
phase's task list calls it out explicitly. Runs the migration's own sqlite3
DDL against a throwaway on-disk database (the migration takes a raw file
path, not a SQLAlchemy engine) rather than models.py's create_all, so this
proves the *migration script* is correct for existing installations -- not
just that a fresh install's models.py schema is correct.
"""
import importlib.util
import os
import sqlite3
import tempfile

import pytest

_MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")


def _load_migration():
    path = os.path.join(_MIGRATIONS_DIR, "053_add_traffic_settings.py")
    spec = importlib.util.spec_from_file_location("migration_053", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def temp_db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    # Minimal pre-migration shape: just enough columns for the migration's
    # PRAGMA table_info() check and an ALTER TABLE ADD COLUMN to run against.
    cursor.execute("CREATE TABLE nets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
    cursor.execute("CREATE TABLE net_templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
    cursor.execute("INSERT INTO nets (name) VALUES ('Existing Net')")
    cursor.execute("INSERT INTO net_templates (name) VALUES ('Existing Template')")
    conn.commit()
    conn.close()
    yield path
    os.remove(path)


def test_migration_adds_columns_with_default_enabled(temp_db_path):
    migration = _load_migration()
    migration.migrate(temp_db_path)

    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()

    for table in ("nets", "net_templates"):
        cursor.execute(f"PRAGMA table_info({table})")
        columns = {row[1]: row for row in cursor.fetchall()}
        assert "traffic_enabled" in columns, f"traffic_enabled missing from {table}"

        # A pre-existing row (inserted before the ALTER TABLE ran) picks up
        # the column default -- 1 (enabled) -- exactly like a fresh install's
        # models.py Boolean(default=True) would produce for a new row.
        cursor.execute(f"SELECT traffic_enabled FROM {table} LIMIT 1")
        assert cursor.fetchone()[0] == 1

    conn.close()


def test_migration_is_idempotent(temp_db_path):
    """Running the migration twice must not raise (the "already exists" skip
    branch), matching every other migration's re-run safety."""
    migration = _load_migration()
    migration.migrate(temp_db_path)
    migration.migrate(temp_db_path)  # should print "already exists" and skip, not raise

    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(nets)")
    columns = [row[1] for row in cursor.fetchall()]
    assert columns.count("traffic_enabled") == 1
    conn.close()


def test_migration_no_op_when_db_missing(tmp_path):
    migration = _load_migration()
    missing_path = str(tmp_path / "does_not_exist.db")
    # Should print a message and return without raising.
    migration.migrate(missing_path)
