"""
Auth smoke tests: token creation/verification and protected-endpoint gating.
"""
import pytest
from app.auth import create_access_token, verify_token


def test_create_and_verify_token():
    payload = {"sub": "42"}
    token = create_access_token(data=payload)
    assert token
    result = verify_token(token)
    assert result is not None
    assert result["sub"] == "42"


def test_invalid_token_returns_none():
    assert verify_token("not.a.valid.token") is None


@pytest.mark.asyncio
async def test_protected_endpoint_requires_auth(client):
    # POST /api/nets/ requires authentication; GET /api/nets/ is public.
    resp = await client.post("/api/nets/", json={"name": "Auth Test Net"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_bad_token_rejected(client):
    resp = await client.post(
        "/api/nets/",
        json={"name": "Auth Test Net"},
        headers={"Authorization": "Bearer bad.token.here"},
    )
    assert resp.status_code == 401
