"""
A schedule's subscribe link (/subscribe/{id}) works for someone signed out.

Requested 2026-10-13: a net manager wanted a link to post so people could
subscribe to one schedule. Two things the page depends on had no way to
work for a signed-out visitor: reading a single schedule, and getting back
to the page after signing in. The return path rides on the emailed sign-in
link, so it is validated to stay inside this site.
"""
import pytest
from pydantic import ValidationError

from tests.conftest import auth_headers
from app.email_service import EmailService
from app.models import NetTemplate, NetTemplateSubscription
from app.schemas import MagicLinkRequest
from app.utils import safe_redirect_path

EMAIL = "kc1abc@example.com"


async def _make_template(db, owner_id: int, is_active: bool = True) -> NetTemplate:
    template = NetTemplate(
        name="Test Schedule",
        owner_id=owner_id,
        schedule_type="ad_hoc",
        schedule_config="{}",
        is_active=is_active,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@pytest.fixture()
def sent(monkeypatch):
    """Record magic-link emails instead of sending them."""
    calls = []

    async def fake_send(email, token, days, redirect=None):
        calls.append((email, redirect))

    monkeypatch.setattr(EmailService, "send_magic_link", staticmethod(fake_send))
    return calls


# ---------------------------------------------------------------------------
# GET /templates/{id} for a signed-out visitor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_guest_can_read_one_schedule(client, db, owner):
    template = await _make_template(db, owner.id)
    resp = await client.get(f"/api/templates/{template.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Test Schedule"
    assert body["owner_callsign"] == owner.callsign
    assert body["is_subscribed"] is False
    assert body["can_manage"] is False


@pytest.mark.asyncio
async def test_guest_reads_the_same_schedule_the_list_shows(client, db, owner):
    """One builder serves both endpoints, so neither can show a guest more."""
    template = await _make_template(db, owner.id)
    single = (await client.get(f"/api/templates/{template.id}")).json()
    listed = (await client.get("/api/templates/")).json()
    assert [single] == listed


@pytest.mark.asyncio
async def test_unknown_schedule_is_404_for_guest(client):
    resp = await client.get("/api/templates/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_inactive_schedule_reports_inactive(client, db, owner):
    template = await _make_template(db, owner.id, is_active=False)
    resp = await client.get(f"/api/templates/{template.id}")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_signed_in_reader_sees_own_subscription(client, db, owner, other):
    template = await _make_template(db, owner.id)
    db.add(NetTemplateSubscription(template_id=template.id, user_id=other.id))
    await db.commit()

    resp = await client.get(f"/api/templates/{template.id}", headers=auth_headers(other))
    assert resp.json()["is_subscribed"] is True
    assert resp.json()["subscriber_count"] == 1
    # The owner is not subscribed just because somebody else is.
    resp = await client.get(f"/api/templates/{template.id}", headers=auth_headers(owner))
    assert resp.json()["is_subscribed"] is False


@pytest.mark.asyncio
async def test_subscribing_still_requires_sign_in(client, db, owner):
    template = await _make_template(db, owner.id)
    resp = await client.post(f"/api/templates/{template.id}/subscribe")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Return path on the sign-in link
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", ["/subscribe/12", "/nets/5?check_in=1", "/scheduler"])
def test_in_app_paths_are_accepted(path):
    assert safe_redirect_path(path) == path


@pytest.mark.parametrize("path", [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "subscribe/12",
    "javascript:alert(1)",
    "/ok\nSet-Cookie: x",
    "/" + "a" * 400,
])
def test_paths_that_could_leave_the_site_are_refused(path):
    with pytest.raises(ValueError):
        safe_redirect_path(path)
    with pytest.raises(ValidationError):
        MagicLinkRequest(email=EMAIL, redirect=path)


def test_no_redirect_is_fine():
    assert safe_redirect_path(None) is None
    assert safe_redirect_path("") is None
    assert MagicLinkRequest(email=EMAIL).redirect is None


@pytest.mark.asyncio
async def test_request_passes_the_return_path_to_the_email(client, sent):
    resp = await client.post(
        "/api/auth/magic-link/request", json={"email": EMAIL, "redirect": "/subscribe/12"}
    )
    assert resp.status_code == 200, resp.text
    assert sent == [(EMAIL, "/subscribe/12")]


@pytest.mark.asyncio
async def test_request_refuses_an_off_site_return_path(client, sent):
    resp = await client.post(
        "/api/auth/magic-link/request", json={"email": EMAIL, "redirect": "//evil.example/"}
    )
    assert resp.status_code == 422
    assert sent == []


@pytest.mark.asyncio
async def test_emailed_link_carries_the_return_path(monkeypatch):
    """The real email builder, with only the SMTP send replaced."""
    from app.email import auth as email_auth
    from app.config import settings

    bodies = []

    async def fake_send_email(to_email, subject, html_content):
        bodies.append(html_content)

    monkeypatch.setattr(email_auth, "send_email", fake_send_email)
    await email_auth.send_magic_link(EMAIL, "tok", 30, "/nets/5?check_in=1")
    await email_auth.send_magic_link(EMAIL, "tok", 30)

    assert f"{settings.frontend_url}/auth/verify?token=tok&amp;redirect=/nets/5%3Fcheck_in%3D1" in bodies[0] \
        or f"{settings.frontend_url}/auth/verify?token=tok&redirect=/nets/5%3Fcheck_in%3D1" in bodies[0]
    assert "redirect=" not in bodies[1]
