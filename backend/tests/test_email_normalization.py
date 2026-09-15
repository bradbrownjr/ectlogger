"""
Regression coverage for case-insensitive email handling.

Before this, magic-link request/verify and admin user creation compared
emails raw (case-sensitive), while password login already lowercased --
so the same address in a different case created a second account instead
of matching the existing one (see Jim Margetts duplicate-account incident,
2026-09-15: jim.margetts65@gmail.com vs Jim.Margetts65@gmail.com).
"""
import pytest
from sqlalchemy import select
from app.models import User
from app.schemas import MagicLinkRequest, AdminUserCreate
from app.routers.auth import get_or_create_user


def test_magic_link_request_schema_lowercases_email():
    payload = MagicLinkRequest(email="Jim.Margetts65@GMAIL.com")
    assert payload.email == "jim.margetts65@gmail.com"


def test_admin_user_create_schema_lowercases_email():
    payload = AdminUserCreate(email="Some.User@Example.COM")
    assert payload.email == "some.user@example.com"


@pytest.mark.asyncio
async def test_get_or_create_user_matches_existing_account_case_insensitively(db):
    existing = User(email="jim.margetts65@gmail.com", callsign="KC1TSJ", is_active=True)
    db.add(existing)
    await db.commit()
    await db.refresh(existing)

    # Simulates what now happens end-to-end: MagicLinkRequest already
    # lowercased the address before it ever reached get_or_create_user.
    found = await get_or_create_user(
        db, "jim.margetts65@gmail.com", "jim.margetts65@gmail.com", "email", "jim.margetts65@gmail.com"
    )

    assert found.id == existing.id

    result = await db.execute(select(User).where(User.email == "jim.margetts65@gmail.com"))
    assert len(result.scalars().all()) == 1
