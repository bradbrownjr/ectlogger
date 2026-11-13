"""
Admin emails that ask for action link to the item they're about.

AB1ZU's early access request (2026-11-13) linked to the whole Users tab, so
the admin had to search for the requester before clicking the timer button.
Each button now carries the filter its tab reads from the link: the Users and
Frequencies tabs read ?search=, the activity log ?user= and ?label=.
"""
import re
from urllib.parse import parse_qs, urlparse

import pytest

from app.email import frequency_requests, schedule_access, security_alerts


@pytest.fixture
def html(monkeypatch):
    """Capture the rendered body instead of sending it."""
    bodies = []

    async def _send(to_email, subject, html_content, **kwargs):
        bodies.append(html_content)

    for module in (schedule_access, frequency_requests, security_alerts):
        monkeypatch.setattr(module, "send_email", _send)
    return bodies


def _query(body: str, link_text: str) -> dict:
    href = re.search(r'href="([^"]+)"[^>]*>' + re.escape(link_text), body).group(1)
    url = urlparse(href.replace("&amp;", "&"))
    assert url.path == "/admin/users"
    return {k: v[0] for k, v in parse_qs(url.query).items()}


@pytest.mark.asyncio
async def test_early_access_request_opens_the_requester(html):
    await schedule_access.send_early_access_request(
        to_email="admin@example.com", requester_display="AB1ZU (Bruce)", requester_email="ab1zu+x@example.com",
        account_age_days=0, min_age_days=7, nets_participated=4, min_participations=1, note=None)

    assert _query(html[0], "Open the Users tab") == {"tab": "users", "search": "ab1zu+x@example.com"}


@pytest.mark.asyncio
async def test_frequency_request_opens_the_frequency(html):
    await frequency_requests.send_frequency_change_request(
        to_email="admin@example.com", requester_display="W1AW", requester_email="w1aw@example.com",
        action="delete", current="146.940 FM (Example Repeater)", search="146.940", proposed=None,
        reason="In use", uses=None, net_names=[], schedule_names=[], note=None)

    assert _query(html[0], "Open the Frequencies tab") == {"tab": "frequencies", "search": "146.940"}


@pytest.mark.asyncio
async def test_failed_sign_in_alert_opens_the_accounts_activity(html):
    await security_alerts.send_failed_sign_in_alert(
        "admin@example.com", "W1AW", 42, attempts=[], two_factor=False, to_admin=True)

    assert _query(html[0], "See W1AW") == {"tab": "activity", "user": "42", "label": "W1AW"}
