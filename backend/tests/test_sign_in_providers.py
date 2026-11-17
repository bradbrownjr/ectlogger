"""Sign in with Google, Microsoft or another OpenID Connect provider.

These test our own rules: which account a sign-in reaches, the issuer check,
single-use codes, linking and the admin setup. How a real provider behaves
is only shown by a real sign-in (docs/concepts/SIGN-IN-PROVIDERS-AND-ADMIN-MODE.md,
"Open questions"); the stub client below stands in for Authlib only, handing
the callback the claims a verified ID token would carry.
"""
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.models import AuditEvent, ProviderSignInCode, SignInProvider, User, UserEmail, UserIdentity, UserRole
from app.services import sign_in_providers as sip
from tests.conftest import auth_headers

MS_COMMON_ISSUER = "https://login.microsoftonline.com/{tenantid}/v2.0"
TENANT = "11111111-2222-3333-4444-555555555555"


async def _provider(db, kind="google", **fields) -> SignInProvider:
    values = dict(slug=kind if kind != "oidc" else "authentik", kind=kind, label=kind.title(), enabled=True,
                  client_id="client-id", client_secret_encrypted=sip.encrypt_client_secret("s3cret"),
                  allow_signup=True)
    values.update(fields)
    provider = SignInProvider(**values)
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return provider


def _google(sub="g-1", email="new@example.org", verified=True, **extra):
    return {"iss": "https://accounts.google.com", "sub": sub, "email": email, "email_verified": verified, **extra}


def _microsoft(oid="o-1", email="new@example.org", edov=True, tid=TENANT, **extra):
    claims = {"iss": f"https://login.microsoftonline.com/{tid}/v2.0", "tid": tid, "oid": oid,
              "sub": "pairwise-" + oid, "email": email, **extra}
    if edov is not None:
        claims["xms_edov"] = edov
    return claims


# ========== ISSUER ==========

def test_issuer_fills_in_microsofts_tenant_placeholder():
    assert sip.issuer_matches(MS_COMMON_ISSUER, _microsoft())
    # Another tenant's issuer on a token claiming this tenant fails.
    assert not sip.issuer_matches(MS_COMMON_ISSUER, {**_microsoft(), "iss": "https://login.microsoftonline.com/x/v2.0"})
    assert not sip.issuer_matches(MS_COMMON_ISSUER, {"iss": "https://login.microsoftonline.com//v2.0"})


def test_issuer_is_compared_exactly_otherwise():
    assert sip.issuer_matches("https://accounts.google.com", _google())
    assert not sip.issuer_matches("https://accounts.google.com", {**_google(), "iss": "https://evil.example"})
    assert not sip.issuer_matches("", _google())


def test_issuer_rule_is_passed_as_a_validator():
    options = sip.issuer_claims_options(MS_COMMON_ISSUER)
    assert options["iss"]["essential"] is True
    assert options["iss"]["validate"](_microsoft(), None) is True


# ========== CLAIMS ==========

@pytest.mark.parametrize("flag,verified", [(True, True), ("true", True), (1, True), ("1", True),
                                           (False, False), ("false", False), (None, False), ("0", False)])
def test_verified_email_flags(flag, verified):
    google = SignInProvider(kind="google")
    microsoft = SignInProvider(kind="microsoft")
    assert (sip.verified_email(google, _google(verified=flag)) is not None) is verified
    assert (sip.verified_email(microsoft, _microsoft(edov=flag)) is not None) is verified


def test_microsoft_never_trusts_email_verified_or_identifies_by_sub():
    microsoft = SignInProvider(kind="microsoft")
    # email_verified is not Microsoft's signal; xms_edov is.
    assert sip.verified_email(microsoft, _microsoft(edov=None, email_verified=True)) is None
    assert sip.subject_for(microsoft, _microsoft()) == f"{TENANT}:o-1"
    assert sip.subject_for(microsoft, {"sub": "x"}) is None


def test_verified_email_is_normalized():
    assert sip.verified_email(SignInProvider(kind="google"), _google(email=" New@Example.ORG ")) == "new@example.org"


# ========== WHICH ACCOUNT A SIGN-IN REACHES ==========

@pytest.mark.asyncio
async def test_first_sign_in_creates_an_account_a_magic_link_reaches(db):
    from app.routers.auth import get_or_create_user
    provider = await _provider(db)
    result = await sip.resolve_account(db, provider, _google(given_name="Pat"))
    await db.commit()
    assert result.created and result.linked
    assert result.user.email == "new@example.org" and result.user.name == "Pat"
    # Keyed like a magic-link account, so the next email link reaches it.
    assert (result.user.oauth_provider, result.user.oauth_id) == ("email", "new@example.org")
    assert (await get_or_create_user(db, "new@example.org", None, "email", "new@example.org")).id == result.user.id


@pytest.mark.asyncio
async def test_a_linked_account_is_found_by_subject_not_email(db, owner):
    provider = await _provider(db)
    db.add(UserIdentity(provider_id=provider.id, user_id=owner.id, subject="g-1"))
    await db.commit()
    # The address changed at Google; the link still reaches the same account.
    result = await sip.resolve_account(db, provider, _google(email="changed@example.org", verified=False))
    assert result.user.id == owner.id and not result.created


@pytest.mark.asyncio
async def test_a_verified_address_links_the_existing_account(db, owner):
    provider = await _provider(db)
    result = await sip.resolve_account(db, provider, _google(email="OWNER@test.com"))
    await db.commit()
    assert result.user.id == owner.id and result.linked and not result.created
    rows = (await db.execute(select(UserIdentity))).scalars().all()
    assert [(r.user_id, r.subject) for r in rows] == [(owner.id, "g-1")]


@pytest.mark.asyncio
async def test_a_verified_backup_address_links_its_account(db, owner):
    db.add(UserEmail(user_id=owner.id, email="backup@example.org"))
    await db.commit()
    provider = await _provider(db, "microsoft", microsoft_tenant=None)
    result = await sip.resolve_account(db, provider, _microsoft(email="backup@example.org", edov="1"))
    assert result.user.id == owner.id


@pytest.mark.asyncio
async def test_an_unverified_address_never_reaches_or_creates_an_account(db, owner):
    provider = await _provider(db, "microsoft")
    taken = await sip.resolve_account(db, provider, _microsoft(email="owner@test.com", edov=None))
    fresh = await sip.resolve_account(db, provider, _microsoft(oid="o-2", email="nobody@example.org", edov=False))
    assert taken.user is None and taken.refusal == "no_verified_email"
    assert fresh.user is None and fresh.refusal == "no_verified_email"
    assert (await db.execute(select(UserIdentity))).scalars().all() == []
    assert (await db.execute(select(User).where(User.email == "nobody@example.org"))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_signup_off_and_allowed_domains(db, owner):
    closed = await _provider(db, allow_signup=False)
    assert (await sip.resolve_account(db, closed, _google())).refusal == "signup_off"
    # An existing account still links while sign-up is off.
    assert (await sip.resolve_account(db, closed, _google(sub="g-9", email="owner@test.com"))).user.id == owner.id

    limited = await _provider(db, "oidc", issuer_url="https://auth.example.org",
                              allowed_domains=sip.dump_domains(["club.org"]))
    assert (await sip.resolve_account(db, limited, _google(sub="a-1"))).refusal == "domain"
    ok = await sip.resolve_account(db, limited, _google(sub="a-2", email="ham@CLUB.org"))
    assert ok.created and ok.user.email == "ham@club.org"


# ========== SINGLE-USE CODES ==========

@pytest.mark.asyncio
async def test_codes_are_single_use_short_lived_and_purpose_bound(db, owner):
    code = await sip.issue_code(db, purpose="signin", user_id=owner.id, minutes=2)
    await db.commit()
    assert await sip.take_code(db, code, "link") is None
    assert (await sip.take_code(db, code, "signin")).user_id == owner.id
    assert await sip.take_code(db, code, "signin") is None

    old = await sip.issue_code(db, purpose="signin", user_id=owner.id, minutes=2)
    row = (await db.execute(select(ProviderSignInCode).order_by(ProviderSignInCode.id.desc()))).scalars().first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db.commit()
    assert await sip.take_code(db, old, "signin") is None
    # Only the hash is stored.
    assert all(code not in r.code_hash for r in (await db.execute(select(ProviderSignInCode))).scalars())


# ========== EXCHANGE ==========

@pytest.mark.asyncio
async def test_exchange_signs_in_once(client, db, owner):
    provider = await _provider(db)
    code = await sip.issue_code(db, purpose="signin", user_id=owner.id, minutes=2,
                                provider_id=provider.id, login_status="ok")
    await db.commit()
    first = await client.post("/api/auth/providers/exchange", json={"code": code})
    assert first.status_code == 200
    body = first.json()
    assert body["login_status"] == "ok" and body["access_token"] and body["user"]["id"] == owner.id
    again = await client.post("/api/auth/providers/exchange", json={"code": code})
    assert again.status_code == 400
    event = (await db.execute(select(AuditEvent).where(AuditEvent.action == "auth.signed_in"))).scalars().one()
    assert json.loads(event.details)["method"] == "Google"


@pytest.mark.asyncio
async def test_exchange_refuses_a_banned_account(client, db, owner):
    code = await sip.issue_code(db, purpose="signin", user_id=owner.id, minutes=2, login_status="ok")
    owner.is_active = False
    await db.commit()
    assert (await client.post("/api/auth/providers/exchange", json={"code": code})).status_code == 403


# ========== CALLBACK (stubbed Authlib client) ==========

class _StubClient:
    def __init__(self, claims, issuer="https://accounts.google.com"):
        self.claims, self.issuer = claims, issuer
        self.claims_options = None

    async def load_server_metadata(self):
        return {"issuer": self.issuer}

    async def authorize_redirect(self, request, redirect_uri):
        self.redirect_uri = redirect_uri
        return RedirectResponse("https://provider.example/authorize")

    async def authorize_access_token(self, request, claims_options=None):
        self.claims_options = claims_options
        return {"access_token": "x", "userinfo": self.claims}


def _query(response):
    return parse_qs(urlparse(response.headers["location"]).query)


@pytest.mark.asyncio
async def test_callback_signs_in_and_admins_without_two_factor_set_it_up(client, db, monkeypatch):
    await _provider(db)
    admin = User(email="boss@example.org", callsign="KC1BOS", role=UserRole.ADMIN, is_active=True,
                 mfa_enabled=False)
    db.add(admin)
    await db.commit()
    stub = _StubClient(_google(email="boss@example.org"))
    monkeypatch.setattr(sip, "build_client", lambda provider: stub)

    response = await client.get("/api/auth/providers/google/callback?code=c&state=s")
    assert response.status_code == 303
    assert urlparse(response.headers["location"]).path == "/auth/provider"
    # Our issuer rule is always handed to Authlib.
    assert stub.claims_options["iss"]["essential"] is True
    result = await client.post("/api/auth/providers/exchange", json={"code": _query(response)["code"][0]})
    assert result.json()["login_status"] == "mfa_setup_required"


@pytest.mark.asyncio
async def test_callback_with_two_factor_on_asks_for_no_code(client, db, owner, monkeypatch):
    await _provider(db)
    owner.mfa_enabled = True
    await db.commit()
    monkeypatch.setattr(sip, "build_client", lambda provider: _StubClient(_google(email="owner@test.com")))
    response = await client.get("/api/auth/providers/google/callback?code=c&state=s")
    result = await client.post("/api/auth/providers/exchange", json={"code": _query(response)["code"][0]})
    assert result.json()["login_status"] == "ok"


@pytest.mark.asyncio
async def test_callback_reports_cancel_and_refusals(client, db, monkeypatch):
    await _provider(db, allow_signup=False)
    cancelled = await client.get("/api/auth/providers/google/callback?error=access_denied")
    assert _query(cancelled) == {"error": ["cancelled"]}

    monkeypatch.setattr(sip, "build_client", lambda provider: _StubClient(_google()))
    refused = await client.get("/api/auth/providers/google/callback?code=c&state=s")
    assert _query(refused) == {"error": ["signup_off"]}
    unknown = await client.get("/api/auth/providers/nope/callback?code=c")
    assert _query(unknown) == {"error": ["unavailable"]}


@pytest.mark.asyncio
async def test_callback_with_no_verified_id_token_signs_nobody_in(client, db, monkeypatch):
    await _provider(db)
    stub = _StubClient(None)
    monkeypatch.setattr(sip, "build_client", lambda provider: stub)
    response = await client.get("/api/auth/providers/google/callback?code=c&state=s")
    assert _query(response) == {"error": ["failed"]}


@pytest.mark.asyncio
async def test_callback_refuses_a_banned_account(client, db, owner, monkeypatch):
    await _provider(db)
    owner.is_active = False
    await db.commit()
    monkeypatch.setattr(sip, "build_client", lambda provider: _StubClient(_google(email="owner@test.com")))
    response = await client.get("/api/auth/providers/google/callback?code=c&state=s")
    assert _query(response) == {"error": ["banned"]}


# ========== LINKING FROM PROFILE ==========

@pytest.mark.asyncio
async def test_link_from_profile_links_whatever_address_the_provider_has(client, db, owner, monkeypatch):
    await _provider(db, "microsoft")
    # An unverified address that matches nobody: only linking can attach it.
    monkeypatch.setattr(sip, "build_client",
                        lambda provider: _StubClient(_microsoft(email="elsewhere@example.org", edov=None),
                                                     issuer=MS_COMMON_ISSUER))
    start = await client.post("/api/auth/providers/microsoft/link", headers=auth_headers(owner))
    assert start.status_code == 200
    link_url = urlparse(start.json()["url"])
    assert link_url.path == "/api/auth/providers/microsoft/start"

    began = await client.get(f"{link_url.path}?{link_url.query}")
    assert began.headers["location"] == "https://provider.example/authorize"
    back = await client.get("/api/auth/providers/microsoft/callback?code=c&state=s")
    assert _query(back)["signin_link"] == ["linked"]

    linked = await client.get("/api/auth/providers/linked", headers=auth_headers(owner))
    assert [(r["provider_slug"], r["email_at_link"]) for r in linked.json()] == [("microsoft", "elsewhere@example.org")]
    # The link code was used up.
    again = await client.get(f"{link_url.path}?{link_url.query}")
    assert _query(again)["signin_link"] == ["expired"]


@pytest.mark.asyncio
async def test_link_refuses_a_provider_account_linked_to_someone_else(client, db, owner, other, monkeypatch):
    provider = await _provider(db)
    db.add(UserIdentity(provider_id=provider.id, user_id=other.id, subject="g-1"))
    await db.commit()
    monkeypatch.setattr(sip, "build_client", lambda p: _StubClient(_google(email="owner@test.com")))
    start = await client.post("/api/auth/providers/google/link", headers=auth_headers(owner))
    url = urlparse(start.json()["url"])
    await client.get(f"{url.path}?{url.query}")
    back = await client.get("/api/auth/providers/google/callback?code=c&state=s")
    assert _query(back)["signin_link"] == ["linked_elsewhere"]


@pytest.mark.asyncio
async def test_unlink_only_your_own(client, db, owner, other):
    provider = await _provider(db)
    mine = UserIdentity(provider_id=provider.id, user_id=owner.id, subject="g-1")
    theirs = UserIdentity(provider_id=provider.id, user_id=other.id, subject="g-2")
    db.add_all([mine, theirs])
    await db.commit()
    assert (await client.delete(f"/api/auth/providers/linked/{theirs.id}", headers=auth_headers(owner))).status_code == 404
    assert (await client.delete(f"/api/auth/providers/linked/{mine.id}", headers=auth_headers(owner))).status_code == 200


# ========== PUBLIC LIST AND ADMIN SETUP ==========

@pytest.mark.asyncio
async def test_public_list_shows_enabled_providers_with_a_secret(client, db):
    await _provider(db)
    await _provider(db, "microsoft", enabled=False)
    await _provider(db, "oidc", issuer_url="https://auth.example.org", client_secret_encrypted=None)
    response = await client.get("/api/auth/providers")
    assert response.json() == [{"slug": "google", "label": "Google", "kind": "google"}]


@pytest.mark.asyncio
async def test_admin_setup_needs_an_admin(client, owner):
    assert (await client.get("/api/admin/sign-in-providers", headers=auth_headers(owner))).status_code == 403


@pytest.mark.asyncio
async def test_admin_adds_changes_and_removes_a_provider(client, db, admin, owner):
    headers = auth_headers(admin)
    off = await client.post("/api/admin/sign-in-providers", headers=headers,
                            json={"kind": "google", "label": "Google", "client_id": "id", "enabled": True})
    assert off.status_code == 400  # no secret yet

    added = await client.post("/api/admin/sign-in-providers", headers=headers,
                              json={"kind": "google", "label": "Google", "client_id": "id",
                                    "client_secret": "s3cret", "enabled": True})
    assert added.status_code == 200
    body = added.json()
    assert body["slug"] == "google" and body["has_client_secret"] and body["client_secret_readable"]
    assert body["redirect_uri"] == "http://test/api/auth/providers/google/callback"
    assert "s3cret" not in added.text

    dup = await client.post("/api/admin/sign-in-providers", headers=headers,
                            json={"kind": "google", "label": "Google 2", "client_id": "id"})
    assert dup.status_code == 409

    changed = await client.put(f"/api/admin/sign-in-providers/{body['id']}", headers=headers,
                               json={"label": "Sign in with Google", "client_secret": "n3w"})
    assert changed.json()["label"] == "Sign in with Google"
    event = (await db.execute(select(AuditEvent).where(
        AuditEvent.action == "admin.sign_in_provider_changed"))).scalars().one()
    assert set(json.loads(event.details)["fields"]) == {"label", "client_secret"} and "n3w" not in event.details

    db.add(UserIdentity(provider_id=body["id"], user_id=owner.id, subject="g-1"))
    await db.commit()
    assert (await client.delete(f"/api/admin/sign-in-providers/{body['id']}", headers=headers)).status_code == 200
    assert (await db.execute(select(UserIdentity))).scalars().all() == []


@pytest.mark.asyncio
async def test_redirect_address_follows_the_proxy(client, admin):
    response = await client.get("/api/admin/sign-in-providers/redirect-uri/microsoft",
                                headers={**auth_headers(admin), "X-Forwarded-Proto": "https",
                                         "X-Forwarded-Host": "ect.example.org"})
    assert response.json() == {"redirect_uri": "https://ect.example.org/api/auth/providers/microsoft/callback"}


@pytest.mark.asyncio
async def test_other_provider_needs_a_name_and_https_issuer(client, admin):
    headers = auth_headers(admin)
    no_slug = await client.post("/api/admin/sign-in-providers", headers=headers,
                                json={"kind": "oidc", "label": "Club", "client_id": "id",
                                      "issuer_url": "https://auth.example.org"})
    http = await client.post("/api/admin/sign-in-providers", headers=headers,
                             json={"kind": "oidc", "slug": "club", "label": "Club", "client_id": "id",
                                   "issuer_url": "http://auth.example.org"})
    assert no_slug.status_code == 422 and http.status_code == 422
