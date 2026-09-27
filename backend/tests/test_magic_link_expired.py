"""
An expired sign-in link gets a one-click replacement instead of a dead end.

Reported 2026-09-27: a bookmarked link over 30 days old "worked" for weeks
(VerifyMagicLink.tsx skips verification while a session exists), then failed
with the same "Invalid or expired" as a mangled link once that browser was
signed out, which read as sign-in being broken. /magic-link/verify now
answers 410 for a genuine-but-old link, and /magic-link/resend emails a
fresh one to the address the old link was issued for.
"""
import time
from unittest.mock import patch

import pytest

from app.auth import create_magic_link_token
from app.config import settings
from app.email_service import EmailService
from app.routers.auth import mask_email

EMAIL = "kc1abc@example.com"


def _expired_token() -> str:
    """A real link, signed by this server, older than the expiry window."""
    too_old = time.time() - (settings.magic_link_expire_days + 1) * 86400
    with patch("itsdangerous.timed.time.time", lambda: too_old):
        return create_magic_link_token(EMAIL)


@pytest.fixture()
def sent(monkeypatch):
    """Record magic-link emails instead of sending them."""
    calls = []

    async def fake_send(email, token, days):
        calls.append((email, token))

    monkeypatch.setattr(EmailService, "send_magic_link", staticmethod(fake_send))
    return calls


@pytest.mark.asyncio
async def test_expired_link_is_410_not_401(client):
    resp = await client.post("/api/auth/magic-link/verify", json={"token": _expired_token()})
    assert resp.status_code == 410
    assert "expired" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_mangled_link_is_still_401(client):
    token = create_magic_link_token(EMAIL)
    resp = await client.post("/api/auth/magic-link/verify", json={"token": token[:-4] + "AAAA"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_resend_mails_the_original_address(client, sent):
    resp = await client.post("/api/auth/magic-link/resend", json={"token": _expired_token()})
    assert resp.status_code == 200, resp.text
    assert resp.json()["email_hint"] == mask_email(EMAIL)
    assert EMAIL not in resp.text, "the full address must never come back from an old link"
    assert [email for email, _ in sent] == [EMAIL]

    # The fresh link actually signs in (a new account for this address here).
    new_token = sent[0][1]
    ok = await client.post("/api/auth/magic-link/verify", json={"token": new_token})
    assert ok.status_code == 200, ok.text


@pytest.mark.asyncio
async def test_resend_refuses_a_token_this_server_did_not_sign(client, sent):
    resp = await client.post("/api/auth/magic-link/resend", json={"token": "not.a.real.token"})
    assert resp.status_code == 400
    assert sent == []


def test_mask_email_hides_all_but_the_first_letter():
    assert mask_email("bradbrownjr@gmail.com") == "b" + "•" * 10 + "@gmail.com"
    assert mask_email("a@b.org") == "a" + "•" * 3 + "@b.org"
