"""Sign in with Google, Microsoft or another OpenID Connect provider.

Admins set providers up in Admin > Security; nothing is configured in `.env`.
A provider is read from the database on each sign-in and a fresh Authlib
client is built from it, so a change applies at once.

Which account a provider sign-in reaches (`resolve_account`):
  1. the account already linked to this provider account (UserIdentity),
  2. otherwise the account whose primary or backup address matches a
     VERIFIED address from the provider, which links it,
  3. otherwise a new account, when the provider allows it and the address is
     in its allowed domains, made by the same path as a first magic link,
  4. otherwise nothing: the person signs in another way and links the
     provider from Profile.

An address the provider doesn't vouch for never reaches or creates an
account: anyone can type any address into some providers' profile fields.
Microsoft in particular says never to identify a user by email, so a
Microsoft account is keyed on tenant + object id and its address counts as
verified only when `xms_edov` says the domain's owner verified it.

See docs/concepts/SIGN-IN-PROVIDERS-AND-ADMIN-MODE.md.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import fernet_for_purpose
from app.models import ProviderSignInCode, SignInProvider, User, UserIdentity
from app.services.account_email import find_user_by_email
from app.utils import normalize_email

KINDS = ("google", "microsoft", "oidc")
KIND_NAMES = {"google": "Google", "microsoft": "Microsoft", "oidc": "OpenID Connect"}

# Slugs form the redirect address (/api/auth/providers/<slug>/callback).
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]$")

_SECRET_PURPOSE = b"ectlogger-sign-in-provider-client-secret"

GOOGLE_DISCOVERY = "https://accounts.google.com/.well-known/openid-configuration"
MICROSOFT_DISCOVERY = "https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration"
SCOPE = "openid email profile"

SIGNIN_CODE_MINUTES = 2
LINK_CODE_MINUTES = 10


# ========== CLIENT SECRET ==========

def encrypt_client_secret(value: str) -> str:
    return fernet_for_purpose(_SECRET_PURPOSE).encrypt(value.encode()).decode()


def decrypt_client_secret(token: Optional[str]) -> Optional[str]:
    """None when unset, or unreadable because SECRET_KEY changed."""
    if not token:
        return None
    try:
        return fernet_for_purpose(_SECRET_PURPOSE).decrypt(token.encode()).decode()
    except Exception:
        return None


# ========== ADDRESSES ==========

def discovery_url(provider: SignInProvider) -> str:
    if provider.kind == "google":
        return GOOGLE_DISCOVERY
    if provider.kind == "microsoft":
        return MICROSOFT_DISCOVERY.format(tenant=provider.microsoft_tenant or "common")
    return (provider.issuer_url or "").rstrip("/") + "/.well-known/openid-configuration"


def public_origin(request: Request) -> str:
    """The scheme and host people reach this site on.

    uvicorn only trusts forwarding headers from 127.0.0.1, and a site can sit
    behind a proxy on another host (beta does), so read them here. Trusting
    them is safe for this one purpose: the provider sends people back only to
    an address registered in its console, and the admin sees this exact
    address in Admin > Security.
    """
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto.split(',')[0].strip()}://{host.split(',')[0].strip()}"


def callback_url(request: Request, slug: str) -> str:
    path = request.app.url_path_for("provider_callback", slug=slug)
    return public_origin(request) + str(path)


# ========== AUTHLIB CLIENT ==========

def build_client(provider: SignInProvider):
    """A fresh Authlib client for this provider. PKCE is sent only when
    code_challenge_method is set (authlib base_client/sync_app.py), and the
    nonce that makes Authlib verify the ID token is added for the openid
    scope."""
    oauth = OAuth()
    oauth.register(
        name=provider.slug,
        client_id=provider.client_id,
        client_secret=decrypt_client_secret(provider.client_secret_encrypted),
        server_metadata_url=discovery_url(provider),
        client_kwargs={"scope": SCOPE, "code_challenge_method": "S256"},
    )
    return oauth.create_client(provider.slug)


def issuer_matches(published: str, claims: dict) -> bool:
    """True when the token's issuer is the provider's published issuer.

    Microsoft's multi-tenant endpoints publish a template,
    https://login.microsoftonline.com/{tenantid}/v2.0, which is filled in with
    the token's own `tid`.
    """
    iss = claims.get("iss")
    if not published or not iss:
        return False
    if "{tenantid}" in published:
        tid = claims.get("tid")
        return bool(tid) and iss == published.replace("{tenantid}", str(tid))
    return iss == published


def issuer_claims_options(published: str) -> dict:
    """Our own `iss` rule for Authlib. Passing claims_options replaces
    Authlib's default literal comparison (base_client/async_openid.py), which
    fails every Microsoft multi-tenant token, so this is passed for every
    provider."""
    return {"iss": {"essential": True, "validate": lambda claims, _value: issuer_matches(published, claims)}}


# ========== CLAIMS ==========

def _true(value) -> bool:
    """Providers send these flags as a JSON boolean, and some as 1, "1" or
    "true" (Microsoft's xms_edov has been seen as "1")."""
    return value is True or value == 1 or (isinstance(value, str) and value.strip().lower() in ("1", "true"))


def subject_for(provider: SignInProvider, claims: dict) -> Optional[str]:
    if provider.kind == "microsoft":
        tid, oid = claims.get("tid"), claims.get("oid")
        return f"{tid}:{oid}" if tid and oid else None
    sub = claims.get("sub")
    return str(sub) if sub else None


def verified_email(provider: SignInProvider, claims: dict) -> Optional[str]:
    email = claims.get("email")
    if not email or not isinstance(email, str):
        return None
    flag = claims.get("xms_edov") if provider.kind == "microsoft" else claims.get("email_verified")
    return normalize_email(email) if _true(flag) else None


def dump_domains(domains: Optional[list]) -> Optional[str]:
    return json.dumps(domains) if domains else None


def domain_allowed(provider: SignInProvider, email: str) -> bool:
    domains = [d.lower().lstrip("@") for d in provider.allowed_domain_list]
    return not domains or email.rsplit("@", 1)[-1].lower() in domains


# ========== ACCOUNTS ==========

# Why a provider sign-in didn't reach an account, worded for Admin > Activity.
# The app's sign-in page has its own wording for the same codes
# (frontend pages/ProviderSignIn.tsx). Anything else logged is the provider's
# own error code or the name of the check that failed.
REASON_TEXT = {
    "no_subject": "the provider sent no account id",
    "no_verified_email": "the provider didn't confirm the email address, and the account isn't linked",
    "signup_off": "no account has this email, and this option doesn't create accounts",
    "domain": "no account has this email, and its domain isn't allowed to create one",
    "access_denied": "cancelled at the provider",
    "no_id_token": "the provider sent no signed ID token",
    "link_failed": "couldn't link the provider to the account",
    "linked_elsewhere": "this provider account is already linked to another account",
}


@dataclass
class Resolution:
    user: Optional[User] = None
    created: bool = False
    linked: bool = False
    # When user is None: "no_subject", "no_verified_email", "signup_off" or "domain".
    refusal: Optional[str] = None


async def find_identity(db: AsyncSession, provider: SignInProvider, subject: str) -> Optional[UserIdentity]:
    result = await db.execute(
        select(UserIdentity).where(UserIdentity.provider_id == provider.id, UserIdentity.subject == subject)
    )
    return result.scalar_one_or_none()


def link_identity(db: AsyncSession, provider: SignInProvider, user: User, subject: str, claims: dict) -> UserIdentity:
    now = datetime.now(timezone.utc)
    identity = UserIdentity(provider_id=provider.id, user_id=user.id, subject=subject,
                            email_at_link=(claims.get("email") or None), linked_at=now, last_used_at=now)
    db.add(identity)
    return identity


async def resolve_account(db: AsyncSession, provider: SignInProvider, claims: dict) -> Resolution:
    """Find, link or create the account a provider sign-in reaches. The
    caller commits."""
    subject = subject_for(provider, claims)
    if not subject:
        return Resolution(refusal="no_subject")

    identity = await find_identity(db, provider, subject)
    if identity is not None:
        identity.last_used_at = datetime.now(timezone.utc)
        return Resolution(user=await db.get(User, identity.user_id))

    email = verified_email(provider, claims)
    if not email:
        return Resolution(refusal="no_verified_email")

    user = await find_user_by_email(db, email)
    if user is not None:
        link_identity(db, provider, user, subject, claims)
        return Resolution(user=user, linked=True)

    if not provider.allow_signup:
        return Resolution(refusal="signup_off")
    if not domain_allowed(provider, email):
        return Resolution(refusal="domain")

    # The first-magic-link path: contact prefill, invited callsign, first
    # account becomes admin. Keyed on the address like a magic link, so a
    # magic link to it later reaches the same account.
    from app.routers.auth import get_or_create_user
    given = claims.get("given_name")
    user = await get_or_create_user(db, email, given if isinstance(given, str) and given else None, "email", email)
    link_identity(db, provider, user, subject, claims)
    return Resolution(user=user, created=True, linked=True)


# ========== SINGLE-USE CODES ==========

def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def issue_code(db: AsyncSession, *, purpose: str, user_id: int, minutes: int,
                     provider_id: Optional[int] = None, login_status: Optional[str] = None) -> str:
    """Store a new code's hash and return the code. The caller commits."""
    code = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.add(ProviderSignInCode(code_hash=_hash(code), purpose=purpose, user_id=user_id,
                              provider_id=provider_id, login_status=login_status,
                              created_at=now, expires_at=now + timedelta(minutes=minutes)))
    return code


async def take_code(db: AsyncSession, code: Optional[str], purpose: str) -> Optional[ProviderSignInCode]:
    """Use up a code. None when unknown, already used, expired, or for
    another purpose. The caller commits."""
    if not code:
        return None
    result = await db.execute(select(ProviderSignInCode).where(ProviderSignInCode.code_hash == _hash(code)))
    row = result.scalar_one_or_none()
    if row is None or row.purpose != purpose or row.used_at is not None:
        return None
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if now >= expires:
        return None
    row.used_at = now
    return row


# ========== ADMIN TEST ==========

async def check_provider(provider: SignInProvider) -> dict:
    """What Admin > Security's Test button reports: the client secret, and
    the provider's discovery document. Whether the client ID and secret are
    right, and the redirect address registered, only a real sign-in shows."""
    problems = []
    if not provider.client_secret_encrypted:
        problems.append("No client secret is saved.")
    elif decrypt_client_secret(provider.client_secret_encrypted) is None:
        problems.append("The saved client secret can't be read because the server's secret key changed. "
                        "Enter the client secret again.")

    url = discovery_url(provider)
    metadata: dict = {}
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            response = await client.get(url)
        response.raise_for_status()
        metadata = response.json()
    except httpx.HTTPStatusError as exc:
        problems.append(f"{url} answered {exc.response.status_code}. Check the "
                        + ("tenant ID." if provider.kind == "microsoft" else "issuer address."))
    except Exception:
        problems.append(f"Couldn't read {url}.")
    else:
        for key in ("issuer", "authorization_endpoint", "token_endpoint", "jwks_uri"):
            if not metadata.get(key):
                problems.append(f"The provider's settings at {url} have no {key}.")
        issuer = (metadata.get("issuer") or "").rstrip("/")
        if provider.kind == "oidc" and issuer and issuer != (provider.issuer_url or "").rstrip("/"):
            problems.append(f"The provider gives its issuer as {metadata['issuer']}. Enter that address exactly.")
    return {"ok": not problems, "problems": problems, "issuer": metadata.get("issuer")}
