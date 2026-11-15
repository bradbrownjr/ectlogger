"""
The Reports tab's closing-email preview.

Renders the email through the same path a real close sends it
(net_closure.load_net_log -> NetLog.email_kwargs -> email/net_logs.py's
builders), with the sections being previewed in place of the stored ones.
Reads only: it never sends, never writes, and never changes the net.

The preview is the copy a recipient with no personal ICS-309 preference
gets, so its format comes from the sections alone.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.email.net_logs import build_ics309_log_email, build_net_log_email
from app.models import CheckIn, StationStatus
from app.services.check_in_columns import format_frequency, load_field_definitions, net_log_fields
from app.services.net_closure import NetLog, load_net_log
from app.services.report_sections import dump_sections, sections_for_recipient
from app.services.station_rows import group_station_rows

# The feature settings the email follows (see NetLog.source).
SOURCE_FIELDS = (
    "ics309_enabled", "ics309_hide_muted_stations", "propagation_logging_enabled",
    "traffic_enabled", "topic_of_week_enabled", "poll_enabled",
)


def report_source(settings_from, report_sections: Optional[list]) -> SimpleNamespace:
    """*settings_from*'s feature settings (a Net or a NetTemplate) with the
    previewed sections in place of the stored ones. A copy, so the net or
    schedule itself is never touched."""
    values = {name: getattr(settings_from, name, False) for name in SOURCE_FIELDS}
    if values["ics309_hide_muted_stations"] is None:
        values["ics309_hide_muted_stations"] = True
    return SimpleNamespace(**values, report_sections=dump_sections(report_sections))


def _render(log: NetLog, tz) -> dict:
    fmt, sections = sections_for_recipient(log.source, log.has_sites, prefers_ics309=False)
    kwargs = log.email_kwargs(tz, fmt, sections)
    rendered = build_ics309_log_email(**kwargs) if fmt == "ics309" else build_net_log_email(**kwargs)
    return {"subject": rendered.subject, "html": rendered.html, "format": fmt}


async def preview_from_net(db: AsyncSession, net, source, tz) -> dict:
    """The email for a real net. The caller loads net.frequencies and
    net.check_ins with CheckIn.frequency, as for send_net_log."""
    log = await load_net_log(db, net, source=source)
    return {**_render(log, tz), "source": "net"}


async def preview_from_example(
    db: AsyncSession,
    *,
    source,
    name: str,
    description: Optional[str],
    frequencies: list,
    topic_prompt: Optional[str],
    poll_question: Optional[str],
    schedule_announcements: Optional[str],
    report_url: str,
    tz,
) -> dict:
    """The email for a made-up net, built in memory from the example roster
    (docs/DEVELOPMENT.md "Example callsigns"). Nothing is added to the
    session. Used for a schedule with no closed net yet, and for a net
    with no check-ins. report_url is where the email's report button
    goes: the net's own report, or the schedule's page when there is no
    net yet."""
    log = await _example_net_log(
        db, source=source, name=name, description=description, frequencies=frequencies,
        topic_prompt=topic_prompt, poll_question=poll_question,
        schedule_announcements=schedule_announcements, report_url=report_url,
    )
    return {**_render(log, tz), "source": "example"}


# (callsign, name, location, minutes after the start, topic answer, poll answer)
_EXAMPLE_STATIONS = [
    ("W1PINE", "Alex Reed", "Gorham, ME", 0, "A J-pole in the attic", "Yes"),
    ("K1COVE", "Dana Whitfield", "Windham, ME", 3, "Dipole between two oaks", "Yes"),
    ("KC1HILL", "Priya Nandan", "Standish, ME", 6, "Mag-mount on the car", "No"),
    ("N1ROVE", "Chris Baumann", "Buxton, ME", 9, "", "Yes"),
    ("W2FERN", None, "Naples, ME", 14, "Vertical on the garage", ""),
]


async def _example_net_log(db, *, source, name, description, frequencies, topic_prompt,
                           poll_question, schedule_announcements, report_url) -> NetLog:
    closed_at = datetime.utcnow().replace(second=0, microsecond=0)
    started_at = closed_at - timedelta(minutes=45)
    # Plain stand-ins for the net's frequencies, so nothing persistent is
    # attached to the made-up net.
    freqs = [
        SimpleNamespace(id=f.id, frequency=f.frequency, mode=f.mode, network=f.network, talkgroup=f.talkgroup)
        for f in frequencies
    ]
    first_freq_id = freqs[0].id if freqs else None

    check_ins = []
    for index, (callsign, person, location, minutes, answer, vote) in enumerate(_EXAMPLE_STATIONS, start=1):
        check_ins.append(CheckIn(
            id=-index, callsign=callsign, name=person, location=location,
            checked_in_at=started_at + timedelta(minutes=minutes),
            status=StationStatus.CHECKED_OUT if index == 4 else StationStatus.CHECKED_IN,
            frequency_id=first_freq_id, is_recheck=False, time_not_recorded=False, in_person=False,
            topic_response=(answer or None) if source.topic_of_week_enabled else None,
            poll_response=(vote or None) if source.poll_enabled else None,
        ))
    # One re-check, so the figures and the table show one
    check_ins.append(CheckIn(
        id=-(len(check_ins) + 1), callsign="KC1HILL", name="Priya Nandan", location="Standish, ME",
        checked_in_at=started_at + timedelta(minutes=30), status=StationStatus.CHECKED_IN,
        frequency_id=first_freq_id, is_recheck=True, time_not_recorded=False, in_person=False,
    ))
    by_callsign = {c.callsign: c for c in check_ins}

    net = SimpleNamespace(
        id=0, name=name, description=description, frequencies=freqs, check_ins=check_ins,
        started_at=started_at, closed_at=closed_at, scheduled_start_time=None,
        paused_at=None, total_paused_seconds=0,
        topic_of_week_prompt=(topic_prompt or "Your home antenna") if source.topic_of_week_enabled else None,
        poll_question=(poll_question or "Will you be at the next drill?") if source.poll_enabled else None,
        announcements="Next week's net is at the usual time.",
        field_config=None,
    )

    def say(callsign, minutes, text):
        user = SimpleNamespace(callsign=callsign) if callsign else None
        return SimpleNamespace(created_at=started_at + timedelta(minutes=minutes), user=user,
                               user_id=None, is_system=callsign is None, message=text)

    chat_messages = [
        say(None, 0, "Net has started"),
        say("K1COVE", 4, "Good signal into Windham tonight."),
        say("KC1HILL", 7, "Thanks for running the net."),
        say(None, 45, "Net has been closed by W1PINE"),
    ]
    can_hear_reports = []
    if source.propagation_logging_enabled:
        can_hear_reports = [
            SimpleNamespace(reporter_check_in_id=by_callsign["K1COVE"].id, heard_check_in_id=by_callsign["W1PINE"].id,
                            frequency_id=first_freq_id, reported_at=started_at + timedelta(minutes=5)),
            SimpleNamespace(reporter_check_in_id=by_callsign["W1PINE"].id, heard_check_in_id=by_callsign["K1COVE"].id,
                            frequency_id=first_freq_id, reported_at=started_at + timedelta(minutes=6)),
        ]
    traffic_summary = None
    if source.traffic_enabled:
        traffic_summary = {"net_id": 0, "draft": 0, "pending": 1, "relayed": 1,
                           "delivered": 2, "cancelled": 0, "outstanding": 0}

    sorted_check_ins = sorted(check_ins, key=lambda c: c.checked_in_at)
    return NetLog(
        net=net,
        source=source,
        chat_messages=chat_messages,
        muted_user_ids=set(),
        sorted_check_ins=sorted_check_ins,
        can_hear_reports=can_hear_reports,
        site_roster=[],
        log_fields=net_log_fields(None, await load_field_definitions(db), sorted_check_ins),
        site_coverage=None,
        traffic_log_entries_for_ics309=[],
        off_net_entries=[],
        traffic_summary=traffic_summary,
        station_groups=group_station_rows(sorted_check_ins, []),
        freq_strings=[label for label in (format_frequency(f) for f in freqs) if label],
        ncs_callsign="W1PINE",
        ncs_name="Alex Reed",
        has_sites=False,
        schedule_announcements=schedule_announcements,
        report_url=report_url,
    )
