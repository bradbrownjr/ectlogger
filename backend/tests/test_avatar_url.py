"""Tests for get_avatar_url — the Gravatar switch and the no-network guarantee.

The headline property here is that building a UserResponse must never touch the
network. The previous implementation issued a blocking HTTP HEAD to gravatar.com
per user (~150-200 ms each) from inside async request handlers, which stalled
the event loop for every other request. These tests pin that it is gone.
"""

import socket
import pytest

from app import utils
from app.utils import get_avatar_url, set_gravatar_enabled


@pytest.fixture(autouse=True)
def _restore_switch():
    original = utils.gravatar_is_enabled()
    yield
    set_gravatar_enabled(original)


@pytest.fixture
def no_network(monkeypatch):
    """Make any outbound socket attempt fail loudly."""
    def _boom(*args, **kwargs):
        raise AssertionError("get_avatar_url must not make a network call")
    monkeypatch.setattr(socket, "socket", _boom)
    monkeypatch.setattr(socket, "create_connection", _boom)


def test_returns_gravatar_url_without_any_network_call(no_network):
    set_gravatar_enabled(True)
    url = get_avatar_url("Person@Example.com ")
    # Hash is of the trimmed, lowercased address.
    assert url == (
        "https://www.gravatar.com/avatar/"
        "7de8517bce4457e8390aa4006a1880fb?s=128&d=404&r=g"
    )


def test_d404_is_present_so_the_client_can_fall_back():
    # d=404 is what makes Gravatar answer 404 for a user with no image, which
    # is what triggers MUI <Avatar>'s fallback to the initial. Without it
    # Gravatar would serve a placeholder image and the fallback would never run.
    set_gravatar_enabled(True)
    assert "d=404" in get_avatar_url("someone@example.com")


def test_disabled_switch_yields_no_gravatar_url(no_network):
    # Nothing may be handed to the client, so no browser contacts gravatar.com.
    set_gravatar_enabled(False)
    assert get_avatar_url("someone@example.com") is None


def test_uploaded_photo_still_wins_when_gravatar_disabled(tmp_path, monkeypatch):
    # Local uploads are served by us and must survive the switch being off.
    monkeypatch.setattr(utils, "AVATAR_DIR", tmp_path)
    (tmp_path / "pic.jpg").write_bytes(b"not empty")

    set_gravatar_enabled(False)
    assert get_avatar_url("someone@example.com", "/api/avatars/pic.jpg") == "/api/avatars/pic.jpg"


def test_missing_upload_falls_through_to_gravatar(tmp_path, monkeypatch):
    # A database restored without its upload directory must not leave a broken
    # image reference pointing at a file that no longer exists.
    monkeypatch.setattr(utils, "AVATAR_DIR", tmp_path)

    set_gravatar_enabled(True)
    url = get_avatar_url("someone@example.com", "/api/avatars/gone.jpg")
    assert url.startswith("https://www.gravatar.com/avatar/")


def test_no_email_yields_nothing():
    set_gravatar_enabled(True)
    assert get_avatar_url(None) is None
    assert get_avatar_url("") is None
