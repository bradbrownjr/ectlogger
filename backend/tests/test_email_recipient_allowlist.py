"""EMAIL_RECIPIENT_ALLOWLIST: a test instance with real mail on can only
reach the addresses it names."""
import pytest

from app.config import settings
from app.email import base


@pytest.fixture
def mail_on(monkeypatch):
    monkeypatch.setattr(settings, "email_enabled", True)
    return monkeypatch


def test_empty_allowlist_allows_everyone(mail_on):
    mail_on.setattr(settings, "email_recipient_allowlist", "")
    assert base._send_suppressed("anyone@example.com", "s") is False


def test_matching_pattern_is_delivered(mail_on):
    mail_on.setattr(settings, "email_recipient_allowlist", "tester+*@gmail.com, tester@gmail.com")
    assert base._send_suppressed("tester+m1@gmail.com", "s") is False
    assert base._send_suppressed("Tester@Gmail.com", "s") is False


def test_non_matching_recipient_is_suppressed(mail_on):
    mail_on.setattr(settings, "email_recipient_allowlist", "tester+*@gmail.com")
    assert base._send_suppressed("operator@example.com", "s") is True
    assert base._send_suppressed("tester@gmail.com", "s") is True


def test_email_disabled_still_wins(monkeypatch):
    monkeypatch.setattr(settings, "email_enabled", False)
    monkeypatch.setattr(settings, "email_recipient_allowlist", "")
    assert base._send_suppressed("anyone@example.com", "s") is True


async def test_send_email_never_connects_for_blocked_recipient(mail_on):
    mail_on.setattr(settings, "email_recipient_allowlist", "tester+*@gmail.com")

    async def explode(*a, **k):
        raise AssertionError("SMTP must not be reached")

    mail_on.setattr(base.aiosmtplib, "send", explode)
    await base.send_email("operator@example.com", "Subject", "<p>hi</p>")
