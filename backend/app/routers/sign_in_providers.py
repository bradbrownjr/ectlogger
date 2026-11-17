"""Sign in with Google, Microsoft or another OpenID Connect provider.

Signed-out flow:
  GET  /auth/providers                 the enabled providers, for the sign-in page
  GET  /auth/providers/{slug}/start    sends the browser to the provider
  GET  /auth/providers/{slug}/callback the provider sends it back here; this
                                       finds the account and sends the browser
                                       to the app's /auth/provider page with a
                                       single-use code
  POST /auth/providers/exchange        the app trades the code for the usual
                                       token, so no token is ever in a URL

Signed in (Profile > Security):
  POST   /auth/providers/{slug}/link   an address that links this provider
  GET    /auth/providers/linked        the providers linked to this account
  DELETE /auth/providers/linked/{id}   unlink one

Admin > Security (admin mode):
  /admin/sign-in-providers             list, add, change, remove, test

Rules for which account a sign-in reaches are in
services/sign_in_providers.py. Design: docs/concepts/SIGN-IN-PROVIDERS-AND-ADMIN-MODE.md.
"""
from datetime import timedelta
from typing import List, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import field_changes, record_event, user_label
from app.auth import create_access_token
from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.logger import logger
from app.models import ProviderSignInCode, SignInProvider, User, UserIdentity, UserRole
from app.schemas import (
    LinkedSignIn,
    LoginResult,
    ProviderExchangeRequest,
    ProviderLinkStart,
    SignInProviderAdmin,
    SignInProviderCreate,
    SignInProviderPublic,
    SignInProviderTestResult,
    SignInProviderUpdate,
    UserResponse,
)
from app.security import get_client_ip
from app.services import sign_in_providers as sip
from app.session_config import get_session_config

router = APIRouter(prefix="/auth/providers", tags=["authentication"])
admin_router = APIRouter(prefix="/admin/sign-in-providers", tags=["admin"])
_limiter = Limiter(key_func=get_remote_address)

# Keys this flow keeps in the short-lived sign-in cookie (SessionMiddleware in
# main.py), beside Authlib's own state, nonce and PKCE verifier.
_SESSION_LINK_USER = "ect_link_user"

BANNED_DETAIL = "Your account has been locked. Please contact an administrator for assistance."


# ========== HELPERS ==========

def _app_url(path: str, **params) -> str:
    query = f"?{urlencode(params)}" if params else ""
    return settings.frontend_url.rstrip("/") + path + query


def _signin_result(**params) -> RedirectResponse:
    """Back to the app's sign-in landing page (frontend pages/ProviderSignIn.tsx)."""
    return RedirectResponse(_app_url("/auth/provider", **params), status_code=status.HTTP_303_SEE_OTHER)


def _link_result(result: str) -> RedirectResponse:
    """Back to Profile > Security after linking, with how it went."""
    return RedirectResponse(_app_url("/profile", tab="security", signin_link=result),
                            status_code=status.HTTP_303_SEE_OTHER)


async def _enabled_provider(db: AsyncSession, slug: str) -> Optional[SignInProvider]:
    result = await db.execute(select(SignInProvider).where(SignInProvider.slug == slug))
    provider = result.scalar_one_or_none()
    if provider is None or not provider.enabled or not sip.decrypt_client_secret(provider.client_secret_encrypted):
        return None
    return provider


def _login_status(user: User) -> str:
    """No two-factor code after a provider sign-in: the provider carries the
    second factor (Brad, 2026-11-15). An admin still enters one to switch to
    admin (app/admin_mode.py), so an admin with no authenticator set up must
    set one up first, exactly as after a magic link."""
    if user.role == UserRole.ADMIN and not user.mfa_enabled:  # admin-mode-ok: sign-in rule
        return "mfa_setup_required"
    return "ok"


def _failed(db: AsyncSession, provider: Optional[SignInProvider], reason: str, user: Optional[User] = None) -> None:
    record_event(db, "auth.provider_failed", user,
                 details={"provider": provider.label if provider else None,
                          "reason": sip.REASON_TEXT.get(reason, reason)})


# ========== SIGNED OUT: LIST, START, CALLBACK, EXCHANGE ==========

@router.get("", response_model=List[SignInProviderPublic])
async def list_providers(db: AsyncSession = Depends(get_db)):
    """Enabled providers, for the sign-in page. Public."""
    result = await db.execute(
        select(SignInProvider).where(SignInProvider.enabled.is_(True)).order_by(SignInProvider.id)
    )
    return [SignInProviderPublic(slug=p.slug, label=p.label, kind=p.kind)
            for p in result.scalars().all() if sip.decrypt_client_secret(p.client_secret_encrypted)]


@router.get("/{slug}/start", name="provider_start")
@_limiter.limit("20/minute")
async def provider_start(request: Request, slug: str, link: Optional[str] = None,
                         db: AsyncSession = Depends(get_db)):
    """Send the browser to the provider. With `link`, a code from
    POST /{slug}/link, the sign-in links the provider to that account
    instead of signing in."""
    provider = await _enabled_provider(db, slug)
    request.session.pop(_SESSION_LINK_USER, None)
    if link is not None:
        row = await sip.take_code(db, link, "link")
        await db.commit()
        if provider is None or row is None or row.provider_id != provider.id:
            return _link_result("expired")
        request.session[_SESSION_LINK_USER] = row.user_id
    elif provider is None:
        return _signin_result(error="unavailable")

    try:
        client = sip.build_client(provider)
        return await client.authorize_redirect(request, sip.callback_url(request, slug))
    except Exception as exc:  # the provider's discovery document was unreachable or wrong
        logger.error("AUTH", f"Sign-in with {provider.label} could not start: {exc!r}")
        request.session.pop(_SESSION_LINK_USER, None)
        return _link_result("failed") if link is not None else _signin_result(error="unavailable")


@router.get("/{slug}/callback", name="provider_callback")
async def provider_callback(request: Request, slug: str, db: AsyncSession = Depends(get_db)):
    """Where the provider sends the browser back. Never returns JSON: it
    always redirects to the app, with a code or a reason it didn't work."""
    link_user_id = request.session.pop(_SESSION_LINK_USER, None)
    fail = _link_result if link_user_id else (lambda reason: _signin_result(error=reason))
    provider = await _enabled_provider(db, slug)
    if provider is None:
        return fail("unavailable")

    # The person said no at the provider, or the provider refused.
    error = request.query_params.get("error")
    if error:
        _failed(db, provider, error)
        await db.commit()
        return fail("cancelled" if error == "access_denied" else "failed")

    try:
        client = sip.build_client(provider)
        metadata = await client.load_server_metadata()
        token = await client.authorize_access_token(
            request, claims_options=sip.issuer_claims_options(metadata.get("issuer", ""))
        )
    except Exception as exc:
        # Wrong or replayed state, a refused code, or an ID token that
        # failed its signature, audience, nonce or issuer check.
        logger.auth_failure(f"Sign-in with {provider.label} failed: {exc!r}", get_client_ip(request))
        _failed(db, provider, type(exc).__name__)
        await db.commit()
        return fail("failed")

    # Authlib verifies the ID token only when a nonce was saved at the start;
    # with no verified token there is nothing to trust.
    claims = token.get("userinfo")
    if not claims:
        _failed(db, provider, "no_id_token")
        await db.commit()
        return fail("failed")
    claims = dict(claims)

    if link_user_id:
        return await _finish_link(db, provider, link_user_id, claims)

    resolution = await sip.resolve_account(db, provider, claims)
    user = resolution.user
    if user is None:
        _failed(db, provider, resolution.refusal)
        await db.commit()
        return fail(resolution.refusal)

    if not user.is_active:
        record_event(db, "auth.banned_sign_in_refused", user, actor_label=user_label(user) or user.banned_callsign,
                     details={"method": provider.label})
        await db.commit()
        return fail("banned")

    if resolution.linked and not resolution.created:
        record_event(db, "auth.provider_linked", user, target_type="user", target_id=user.id,
                     target_label=user_label(user), details={"provider": provider.label, "by": "email"})
    code = await sip.issue_code(db, purpose="signin", user_id=user.id, minutes=sip.SIGNIN_CODE_MINUTES,
                                provider_id=provider.id, login_status=_login_status(user))
    await db.commit()
    return _signin_result(code=code)


async def _finish_link(db: AsyncSession, provider: SignInProvider, user_id: int, claims: dict) -> RedirectResponse:
    """Link the provider account to the signed-in account that asked, whatever
    address the provider holds: this covers every case the email match in
    resolve_account refuses."""
    user = await db.get(User, user_id)
    subject = sip.subject_for(provider, claims)
    if user is None or not user.is_active or not subject:
        _failed(db, provider, "link_failed", user)
        await db.commit()
        return _link_result("failed")

    existing = await sip.find_identity(db, provider, subject)
    if existing is not None and existing.user_id != user.id:
        _failed(db, provider, "linked_elsewhere", user)
        await db.commit()
        return _link_result("linked_elsewhere")
    if existing is None:
        sip.link_identity(db, provider, user, subject, claims)
        record_event(db, "auth.provider_linked", user, target_type="user", target_id=user.id,
                     target_label=user_label(user), details={"provider": provider.label, "by": "profile"})
    await db.commit()
    return _link_result("linked")


@router.post("/exchange", response_model=LoginResult)
@_limiter.limit("20/minute")
async def provider_exchange(request: Request, payload: ProviderExchangeRequest,
                            db: AsyncSession = Depends(get_db)):
    """Trade the code from the callback for a sign-in token.

    Request: { code }. Response: LoginResult, "ok" or "mfa_setup_required".
    400 when the code is unknown, used or more than two minutes old.
    """
    row = await sip.take_code(db, payload.code, "signin")
    await db.commit()
    if row is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in has expired. Try signing in again.")
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, BANNED_DETAIL)

    provider = await db.get(SignInProvider, row.provider_id) if row.provider_id else None
    logger.auth_success(user.email, get_client_ip(request))
    record_event(db, "auth.signed_in", user, details={"method": provider.label if provider else "sign-in provider"})
    await db.commit()

    lifetime_days, _ = await get_session_config(db)
    access_token = create_access_token(data={"sub": str(user.id)}, expires_delta=timedelta(days=lifetime_days))
    return LoginResult(login_status=row.login_status or "ok", access_token=access_token,
                       token_type="bearer", user=UserResponse.from_orm(user))


# ========== SIGNED IN: LINK AND UNLINK (Profile > Security) ==========

@router.post("/{slug}/link", response_model=ProviderLinkStart)
async def provider_link_start(request: Request, slug: str, current_user: User = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)):
    """The address the browser opens to link this provider to the signed-in
    account. The start address can't see the user's token, so a single-use
    code good for ten minutes carries who asked."""
    provider = await _enabled_provider(db, slug)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That sign-in option isn't available.")
    code = await sip.issue_code(db, purpose="link", user_id=current_user.id,
                                minutes=sip.LINK_CODE_MINUTES, provider_id=provider.id)
    await db.commit()
    path = request.app.url_path_for("provider_start", slug=slug)
    return ProviderLinkStart(url=f"{sip.public_origin(request)}{path}?{urlencode({'link': code})}")


@router.get("/linked", response_model=List[LinkedSignIn])
async def list_linked(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserIdentity, SignInProvider)
        .join(SignInProvider, SignInProvider.id == UserIdentity.provider_id)
        .where(UserIdentity.user_id == current_user.id)
        .order_by(UserIdentity.id)
    )
    return [LinkedSignIn(id=i.id, provider_slug=p.slug, provider_label=p.label, kind=p.kind,
                         email_at_link=i.email_at_link, linked_at=i.linked_at, last_used_at=i.last_used_at)
            for i, p in result.all()]


@router.delete("/linked/{identity_id}")
async def unlink(identity_id: int, current_user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    """Unlink a provider. Always allowed: an email link still reaches the account."""
    identity = await db.get(UserIdentity, identity_id)
    if identity is None or identity.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    provider = await db.get(SignInProvider, identity.provider_id)
    await db.delete(identity)
    record_event(db, "auth.provider_unlinked", current_user, target_type="user", target_id=current_user.id,
                 target_label=user_label(current_user),
                 details={"provider": provider.label if provider else None})
    await db.commit()
    return {"success": True}


# ========== ADMIN > SECURITY ==========

async def _linked_counts(db: AsyncSession) -> dict:
    result = await db.execute(
        select(UserIdentity.provider_id, func.count(UserIdentity.id)).group_by(UserIdentity.provider_id)
    )
    return dict(result.all())


def _admin_view(request: Request, provider: SignInProvider, linked: int = 0) -> SignInProviderAdmin:
    return SignInProviderAdmin(
        id=provider.id, slug=provider.slug, kind=provider.kind, label=provider.label,
        enabled=provider.enabled, client_id=provider.client_id,
        has_client_secret=bool(provider.client_secret_encrypted),
        client_secret_readable=sip.decrypt_client_secret(provider.client_secret_encrypted) is not None,
        issuer_url=provider.issuer_url, microsoft_tenant=provider.microsoft_tenant,
        allowed_domains=provider.allowed_domain_list, allow_signup=provider.allow_signup,
        redirect_uri=sip.callback_url(request, provider.slug), linked_accounts=linked,
    )


def _require_readable_secret_to_enable(provider: SignInProvider) -> None:
    if provider.enabled and sip.decrypt_client_secret(provider.client_secret_encrypted) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add the client secret before turning this on.")


@admin_router.get("", response_model=List[SignInProviderAdmin])
async def admin_list(request: Request, _: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    counts = await _linked_counts(db)
    result = await db.execute(select(SignInProvider).order_by(SignInProvider.id))
    return [_admin_view(request, p, counts.get(p.id, 0)) for p in result.scalars().all()]


@admin_router.get("/redirect-uri/{slug}")
async def admin_redirect_uri(request: Request, slug: str, _: User = Depends(get_admin_user)):
    """The address to register in the provider's console, before the
    provider is saved here."""
    if not sip.SLUG_PATTERN.match(slug):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use lower-case letters, numbers and hyphens.")
    return {"redirect_uri": sip.callback_url(request, slug)}


@admin_router.post("", response_model=SignInProviderAdmin)
async def admin_create(request: Request, payload: SignInProviderCreate, admin: User = Depends(get_admin_user),
                       db: AsyncSession = Depends(get_db)):
    taken = await db.execute(select(SignInProvider.id).where(SignInProvider.slug == payload.slug))
    if taken.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"There is already a sign-in option at /{payload.slug}. Edit that one instead.")
    provider = SignInProvider(
        slug=payload.slug, kind=payload.kind, label=payload.label, enabled=payload.enabled,
        client_id=payload.client_id,
        client_secret_encrypted=sip.encrypt_client_secret(payload.client_secret) if payload.client_secret else None,
        issuer_url=payload.issuer_url, microsoft_tenant=payload.microsoft_tenant,
        allowed_domains=sip.dump_domains(payload.allowed_domains), allow_signup=payload.allow_signup,
    )
    _require_readable_secret_to_enable(provider)
    db.add(provider)
    await db.flush()
    record_event(db, "admin.sign_in_provider_added", admin, target_type="sign_in_provider", target_id=provider.id,
                 target_label=provider.label, details={"kind": provider.kind, "enabled": provider.enabled})
    await db.commit()
    await db.refresh(provider)
    return _admin_view(request, provider)


@admin_router.put("/{provider_id}", response_model=SignInProviderAdmin)
async def admin_update(request: Request, provider_id: int, payload: SignInProviderUpdate,
                       admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    provider = await db.get(SignInProvider, provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    values = payload.model_dump(exclude_unset=True)
    secret = values.pop("client_secret", None)
    if "allowed_domains" in values:
        values["allowed_domains"] = sip.dump_domains(values["allowed_domains"])
    if provider.kind != "oidc":
        values.pop("issuer_url", None)
    if provider.kind != "microsoft":
        values.pop("microsoft_tenant", None)
    for field in ("label", "client_id", "enabled", "allow_signup"):
        if field in values and values[field] is None:
            values.pop(field)  # required fields: leaving one out keeps it
    if "label" in values:
        values["label"] = values["label"].strip()
    if "client_id" in values:
        values["client_id"] = values["client_id"].strip()

    # Read the changes before applying them (audit.field_changes). The secret
    # is never logged, only that it was replaced.
    changes = field_changes(provider, values, values.keys())
    for field in changes:
        setattr(provider, field, values[field])
    if secret:
        provider.client_secret_encrypted = sip.encrypt_client_secret(secret.strip())
        changes["client_secret"] = ["(saved)", "(replaced)"]

    _require_readable_secret_to_enable(provider)
    if changes:
        record_event(db, "admin.sign_in_provider_changed", admin, target_type="sign_in_provider",
                     target_id=provider.id, target_label=provider.label, details={"changes": changes})
    await db.commit()
    await db.refresh(provider)
    counts = await _linked_counts(db)
    return _admin_view(request, provider, counts.get(provider.id, 0))


@admin_router.delete("/{provider_id}")
async def admin_delete(provider_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Remove a provider and every account link to it. Accounts keep working
    by email link and password."""
    provider = await db.get(SignInProvider, provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    linked = (await _linked_counts(db)).get(provider.id, 0)
    # SQLite doesn't enforce ON DELETE CASCADE here, so remove the rows that
    # point at the provider explicitly.
    await db.execute(delete(UserIdentity).where(UserIdentity.provider_id == provider.id))
    await db.execute(delete(ProviderSignInCode).where(ProviderSignInCode.provider_id == provider.id))
    record_event(db, "admin.sign_in_provider_removed", admin, target_type="sign_in_provider", target_id=provider.id,
                 target_label=provider.label, details={"kind": provider.kind, "linked_accounts": linked})
    await db.delete(provider)
    await db.commit()
    return {"success": True}


@admin_router.post("/{provider_id}/test", response_model=SignInProviderTestResult)
async def admin_test(provider_id: int, _: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Check what can be checked without signing anyone in: the client
    secret, and the provider's discovery document. The client ID and secret
    themselves are only proven by a real sign-in."""
    provider = await db.get(SignInProvider, provider_id)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return await sip.check_provider(provider)
