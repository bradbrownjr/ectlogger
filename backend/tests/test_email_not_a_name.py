"""
An email address is never an operator's name.

Magic-link sign-up stored the address as a new account's name until
2026-10-19, and signed-out visitors see the first word of a name, so public
lists (a net's roles, a schedule's staff) showed those addresses. Sign-up now
leaves the name empty for profile setup to ask, migration 082 clears the
stored ones, and public_display_name refuses anything that looks like one.
"""
import importlib.util
import os
import sqlite3

import pytest
from sqlalchemy import select

from app.auth import create_magic_link_token
from app.models import User
from app.schemas import public_display_name


@pytest.mark.asyncio
async def test_magic_link_sign_up_leaves_the_name_empty(client, db):
    resp = await client.post("/api/auth/magic-link/verify", json={"token": create_magic_link_token("new@example.com")})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["name"] is None
    user = (await db.execute(select(User).where(User.email == "new@example.com"))).scalar_one()
    assert user.name is None


def test_guests_never_see_an_address_as_a_name():
    assert public_display_name("ken@example.com", False) is None
    assert public_display_name("ken@example.com Smith", False) is None
    assert public_display_name("Ken Smith", False) == "Ken"
    # Signed in, the stored value is shown as is (migration 082 cleans it).
    assert public_display_name("Ken Smith", True) == "Ken Smith"


def test_migration_clears_only_names_that_are_the_address(tmp_path):
    path = tmp_path / "m.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT)")
    conn.executemany("INSERT INTO users (email, name) VALUES (?, ?)", [
        ("a@example.com", "a@example.com"),
        ("b@example.com", " B@Example.com "),
        ("c@example.com", "Carol"),
        ("d@example.com", None),
        ("e@example.com", "other@example.com"),
    ])
    conn.commit()
    conn.close()
    spec = importlib.util.spec_from_file_location(
        "m082", os.path.join(os.path.dirname(__file__), "..", "migrations", "082_clear_email_names.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.migrate(str(path))
    module.migrate(str(path))
    names = [r[0] for r in sqlite3.connect(path).execute("SELECT name FROM users ORDER BY id")]
    assert names == [None, None, "Carol", None, "other@example.com"]
