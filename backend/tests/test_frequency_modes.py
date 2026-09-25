"""
The server's frequency modes and the frontend's mode pickers must be the same
list. Until 2026-09-25 there were three hand-written copies that disagreed,
and Admin > Frequencies offered five modes the server refused to save.
"""
import re
from pathlib import Path

import pytest

from app.schemas import FREQUENCY_MODES
from tests.conftest import auth_headers

FRONTEND_MODES = Path(__file__).resolve().parents[2] / "frontend" / "src" / "utils" / "frequencyModes.ts"


def test_frontend_offers_exactly_the_modes_the_server_accepts():
    source = FRONTEND_MODES.read_text()
    body = source[source.index("export const FREQUENCY_MODES"):]
    body = body[: body.index("];")]
    frontend = re.findall(r"value: '([^']+)'", body)
    assert frontend == list(FREQUENCY_MODES)


@pytest.mark.parametrize("mode", FREQUENCY_MODES)
async def test_every_mode_can_be_saved(client, owner, mode):
    r = await client.post(
        "/api/frequencies",
        json={"frequency": "146.520", "network": "Test", "mode": mode},
        headers=auth_headers(owner),
    )
    assert r.status_code == 201, r.text


async def test_unknown_mode_is_refused(client, owner):
    r = await client.post(
        "/api/frequencies",
        json={"frequency": "146.520", "mode": "SMOKE"},
        headers=auth_headers(owner),
    )
    assert r.status_code == 422


async def test_a_row_saved_under_an_older_mode_list_still_loads(client, db):
    """The mode check applies to input only. It sat on the shared base schema
    at first, so one row with a since-dropped mode (the demo seed's LSB)
    failed every frequency list response."""
    from app.models import Frequency
    db.add(Frequency(frequency="3.930", mode="LSB"))
    await db.commit()
    r = await client.get("/api/frequencies")
    assert r.status_code == 200
    assert [f["mode"] for f in r.json()] == ["LSB"]
