"""
A one-time net's schedule can be turned into a recurring or Ad-Hoc schedule
by editing its Schedule Type, and back again. Checked 2026-09-25 before the
docs started telling net managers to do this: the dashboard's + button makes
a One-Time schedule behind every net, and the Scheduler lists it like any
other, so converting it keeps the net's frequencies, script and staff.
"""
from app.models import NetStatus
from tests.conftest import auth_headers
from tests.test_templates import _make_template


async def test_one_time_schedule_converts_to_ad_hoc_and_weekly(client, db, owner):
    template = await _make_template(db, owner.id, schedule_type="one_time")
    headers = auth_headers(owner)

    first = await client.post(f"/api/templates/{template.id}/create-net", headers=headers)
    assert first.status_code == 200
    first_id = first.json()["id"]

    # Close the one-time net, as it would be by the time anyone converts it.
    await client.post(f"/api/nets/{first_id}/start", headers=headers)
    assert (await client.post(f"/api/nets/{first_id}/close", headers=headers)).status_code == 200

    # One-Time -> Ad-Hoc, then start another net from it whenever needed.
    r = await client.put(f"/api/templates/{template.id}", json={"schedule_type": "ad_hoc"}, headers=headers)
    assert r.status_code == 200 and r.json()["schedule_type"] == "ad_hoc"
    second = await client.post(f"/api/templates/{template.id}/create-net", headers=headers)
    assert second.status_code == 200
    assert second.json()["template_id"] == template.id
    assert [f["frequency"] for f in second.json()["frequencies"]] == ["146.520"]

    # Ad-Hoc -> Weekly and back keeps the same schedule, with the earlier nets still on it.
    weekly = {"schedule_type": "weekly", "schedule_config": {"day_of_week": 3, "week_of_month": [], "time": "19:00"}}
    r = await client.put(f"/api/templates/{template.id}", json=weekly, headers=headers)
    assert r.status_code == 200 and r.json()["schedule_type"] == "weekly"
    r = await client.put(f"/api/templates/{template.id}", json={"schedule_type": "ad_hoc"}, headers=headers)
    assert r.json()["schedule_type"] == "ad_hoc"

    first_net = (await client.get(f"/api/nets/{first_id}", headers=headers)).json()
    assert first_net["template_id"] == template.id
    # Creating the second net archived it, as any schedule does with its
    # previous closed nets; converting the type doesn't change that.
    assert first_net["status"] == NetStatus.ARCHIVED.value
