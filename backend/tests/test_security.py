from fastapi import Request

from app.security import get_client_ip


def _request(peer: str | None, headers: dict[str, str] | None = None) -> Request:
    """A minimal ASGI scope - enough for Request.client and Request.headers,
    which is all get_client_ip touches."""
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": (peer, 12345) if peer else None})


def test_forwarded_for_is_read_right_to_left_from_a_trusted_proxy():
    """The header Caddy hands us is `<whatever the client sent>, <real peer>`,
    because Caddy appends rather than replaces. The rightmost entry is the only
    one our own proxy vouched for."""
    req = _request("127.0.0.1", {"X-Forwarded-For": "203.0.113.9"})
    assert get_client_ip(req) == "203.0.113.9"


def test_forged_forwarded_for_entry_cannot_choose_the_banned_address():
    """The attack this ordering exists to stop: a client at 9.9.9.9 sends
    `X-Forwarded-For: 1.2.3.4`, Caddy appends the address it actually saw, and
    a naive first-entry read would log - and get fail2ban to ban - 1.2.3.4, an
    address the attacker picked. Reading right-to-left reports the real peer."""
    req = _request("127.0.0.1", {"X-Forwarded-For": "1.2.3.4, 9.9.9.9"})
    assert get_client_ip(req) == "9.9.9.9"


def test_forwarded_for_is_ignored_from_an_untrusted_peer():
    """A direct connection has no reason to be believed about who it is."""
    req = _request("198.51.100.7", {"X-Forwarded-For": "1.2.3.4"})
    assert get_client_ip(req) == "198.51.100.7"


def test_falls_back_to_the_socket_address():
    assert get_client_ip(_request("127.0.0.1")) == "127.0.0.1"
    assert get_client_ip(_request(None)) == "unknown"
