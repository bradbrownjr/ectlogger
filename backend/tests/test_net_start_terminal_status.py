"""
Regression tests for the terminal-status holes in POST /nets/{id}/start and
POST /nets/{id}/close, found and closed 2026-09-19.

start_net listed the statuses it rejects (ACTIVE, "already active"; LOBBY,
"already in lobby mode") rather than the ones it accepts, so CLOSED, ARCHIVED
and CANCELLED fell through into the lobby-or-active branch and the net was
reopened. The damage was never an access-control one -- every caller who could
reach it could already start and close nets -- it was to the net's own record:

  * started_at was recomputed, and every duration in the report, the statistics
    page and the ICS-309 is derived from it;
  * a fresh NCS role and check-in were appended to a log that had already been
    exported and emailed at close, so the roster gained a station the copy in
    everyone's inbox does not have;
  * closed_at / cancelled_at stayed stamped on a net now claiming to be ACTIVE,
    and neither restore_net nor unarchive will touch it in that state;
  * a net cancelled before it ever started still had a null
    start_notification_sent_at, so the idempotent "net is starting" email was
    not idempotent for it -- reopening announced a called-off net to every
    subscriber on the schedule. That is the one effect that reached people who
    were not looking at the app, and test_cancelled_net_does_not_announce_itself
    below is the one guarding it.

Neither Start button renders on these statuses, so this was only reachable by
calling the API directly. The tests drive the router rather than the button for
exactly that reason.

close_net had the same shape one endpoint over: it rejected CLOSED alone, so an
ARCHIVED net could be closed back down to CLOSED (un-archiving it, and sending
every subscriber a second ICS-309 for a net whose log they already had), and a
DRAFT or SCHEDULED net that never ran could be closed into an empty log. Both
endpoints now name the statuses they accept instead.
"""
import pytest
from sqlalchemy import func, select

from app.models import CheckIn, Frequency, Net, NetStatus, NetTemplate, net_template_frequencies
from tests.conftest import auth_headers


async def _net_in_status(client, db, owner, status: NetStatus) -> Net:
    """Create a real net through the API, then put it in a terminal status the
    way close/archive/cancel would leave it."""
    freq = Frequency(frequency="146.520", mode="FM", description="Test Simplex")
    db.add(freq)
    await db.flush()
    template = NetTemplate(
        name="Terminal Status Net",
        owner_id=owner.id,
        schedule_type="ad_hoc",
        schedule_config="{}",
    )
    db.add(template)
    await db.flush()
    await db.execute(
        net_template_frequencies.insert().values(template_id=template.id, frequency_id=freq.id)
    )
    await db.commit()

    create = await client.post(
        f"/api/templates/{template.id}/create-net", headers=auth_headers(owner)
    )
    net_id = create.json()["id"]

    net = (await db.execute(select(Net).where(Net.id == net_id))).scalar_one()
    net.status = status
    if status is NetStatus.CANCELLED:
        # Called off before it ever ran, so it was never announced either.
        net.cancelled_at = func.now()
    elif status in (NetStatus.CLOSED, NetStatus.ARCHIVED):
        # A net that actually ran: started once, closed once, announced once.
        net.started_at = func.now()
        net.closed_at = func.now()
        net.start_notification_sent_at = func.now()
    await db.commit()
    await db.refresh(net)
    return net


@pytest.mark.parametrize("status", [NetStatus.CLOSED, NetStatus.ARCHIVED, NetStatus.CANCELLED])
@pytest.mark.asyncio
async def test_terminal_nets_refuse_to_start(client, db, owner, status):
    """The owner is the most privileged caller short of an admin, so if anyone
    could reopen a finished net it would be them."""
    net = await _net_in_status(client, db, owner, status)

    response = await client.post(f"/api/nets/{net.id}/start", headers=auth_headers(owner))

    assert response.status_code == 400


@pytest.mark.parametrize("status", [NetStatus.CLOSED, NetStatus.ARCHIVED, NetStatus.CANCELLED])
@pytest.mark.asyncio
async def test_refused_start_leaves_the_net_untouched(client, db, owner, status):
    """A 400 is only half the guarantee. The refusal has to happen before any
    of start_net's side effects, not after some of them."""
    net = await _net_in_status(client, db, owner, status)
    started_at_before = net.started_at

    await client.post(f"/api/nets/{net.id}/start", headers=auth_headers(owner))

    await db.refresh(net)
    assert net.status is status
    assert net.started_at == started_at_before

    # No NCS check-in was appended to the closed net's log.
    check_ins = (
        await db.execute(select(func.count()).select_from(CheckIn).where(CheckIn.net_id == net.id))
    ).scalar_one()
    assert check_ins == 0


@pytest.mark.asyncio
async def test_cancelled_net_does_not_announce_itself(client, db, owner):
    """The subscriber email. A cancelled net never started, so
    start_notification_sent_at is null and send_net_start_notifications would
    have treated the reopen as the first announcement."""
    net = await _net_in_status(client, db, owner, NetStatus.CANCELLED)
    assert net.start_notification_sent_at is None  # the precondition that made it possible

    await client.post(f"/api/nets/{net.id}/start", headers=auth_headers(owner))

    await db.refresh(net)
    assert net.start_notification_sent_at is None


@pytest.mark.asyncio
async def test_cancelled_net_can_still_be_restored_then_started(client, db, owner):
    """Restore is the supported route back, and the guard must not block it.
    This is the path the 400's wording points the caller at."""
    net = await _net_in_status(client, db, owner, NetStatus.CANCELLED)

    restore = await client.post(f"/api/nets/{net.id}/restore", headers=auth_headers(owner))
    assert restore.status_code == 200

    start = await client.post(f"/api/nets/{net.id}/start", headers=auth_headers(owner))
    assert start.status_code == 200


@pytest.mark.asyncio
async def test_draft_net_still_starts(client, db, owner):
    """The allow-list must not have narrowed the normal case."""
    net = await _net_in_status(client, db, owner, NetStatus.DRAFT)

    response = await client.post(f"/api/nets/{net.id}/start", headers=auth_headers(owner))

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# The same shape in close_net
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_archived_net_cannot_be_closed_again(client, db, owner):
    """Closing an archived net used to set it back to CLOSED, which un-archives
    it and re-sends the net log to everyone who already has it."""
    net = await _net_in_status(client, db, owner, NetStatus.ARCHIVED)

    response = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(owner))

    assert response.status_code == 400
    await db.refresh(net)
    assert net.status is NetStatus.ARCHIVED


@pytest.mark.parametrize("status", [NetStatus.DRAFT, NetStatus.SCHEDULED])
@pytest.mark.asyncio
async def test_a_net_that_never_ran_cannot_be_closed(client, db, owner, status):
    """Cancel is the action for these, and it is the one the Dashboard offers.
    Closing them emailed an ICS-309 for a net that never happened."""
    net = await _net_in_status(client, db, owner, status)

    response = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(owner))

    assert response.status_code == 400
    await db.refresh(net)
    assert net.status is status


@pytest.mark.asyncio
async def test_a_running_net_still_closes(client, db, owner):
    """The control: the only case the button actually offers."""
    net = await _net_in_status(client, db, owner, NetStatus.DRAFT)
    await client.post(f"/api/nets/{net.id}/start", headers=auth_headers(owner))

    response = await client.post(f"/api/nets/{net.id}/close", headers=auth_headers(owner))

    assert response.status_code == 200
    await db.refresh(net)
    assert net.status is NetStatus.CLOSED
