"""
The closing email's optional sections, set on a net's or schedule's Reports tab.

The one list of section keys. The API validates against it (schemas.py), the
Reports tab reads it from GET /api/report-sections, and the closing email
(services/net_closure.py, email/net_logs.py) gates every optional block on
the set resolve_sections returns.

Net.report_sections / NetTemplate.report_sections hold a JSON list of keys.
Null means the net was never set up on the Reports tab: the email is then
exactly what it was before the column existed (migration 101), which is the
`legacy_plain` set for the plain email and the `legacy_ics309` set for the
ICS-309 email. An empty list is a real choice (none of them).
"""
import json
from dataclasses import asdict, dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class ReportSection:
    key: str
    label: str
    help: str
    # Form settings that make the section available; any one is enough.
    # Empty = always available. Names match the net and schedule form fields,
    # plus has_sites (a net with any coverage site; schedules have none).
    requires_any: List[str] = field(default_factory=list)
    # Part of the email a net gets when report_sections is null.
    legacy_plain: bool = False
    legacy_ics309: bool = False


# Display order on the Reports tab, which is also their order in the email.
REPORT_SECTIONS: List[ReportSection] = [
    ReportSection(
        key="report_link",
        label="Link to the full report",
        help="A button near the top that opens the net's report.",
    ),
    ReportSection(
        key="figures",
        label="Headline figures",
        help="Total check-ins, unique operators, re-checks, and how long the net ran.",
    ),
    ReportSection(
        key="topic",
        label="Topic of the week, with each station's answer",
        help="Each station's latest answer, listed under the topic.",
        requires_any=["topic_of_week_enabled"],
        legacy_plain=True,
    ),
    ReportSection(
        key="poll",
        label="Poll results",
        help="How many stations gave each answer.",
        requires_any=["poll_enabled"],
        legacy_plain=True,
    ),
    ReportSection(
        key="coverage",
        label="Sites and station coverage",
        help="Who was at each site, which stations could hear each other, and coverage by site.",
        requires_any=["propagation_logging_enabled", "has_sites"],
        legacy_plain=True,
    ),
    ReportSection(
        key="traffic",
        label="Traffic handled",
        help="How many messages were pending, relayed, delivered, or cancelled. Never the message text.",
        requires_any=["traffic_enabled"],
        legacy_plain=True,
    ),
    ReportSection(
        key="ics309_log",
        label="ICS-309 log",
        help="Sends the log as an ICS-309 communications log in place of the check-in table. Off, the email has the regular check-in log.",
        requires_any=["ics309_enabled"],
        legacy_ics309=True,
    ),
    ReportSection(
        key="announcements",
        label="Announcements and net notes",
        help="The schedule's announcements, then this net's notes, after the log.",
    ),
    ReportSection(
        key="chat_log",
        label="Chat log (attached as a text file)",
        help="Every chat message with its time and callsign.",
        legacy_plain=True,
    ),
]

SECTION_KEYS = frozenset(s.key for s in REPORT_SECTIONS)
_BY_KEY = {s.key: s for s in REPORT_SECTIONS}

LEGACY_PLAIN = frozenset(s.key for s in REPORT_SECTIONS if s.legacy_plain)
LEGACY_ICS309 = frozenset(s.key for s in REPORT_SECTIONS if s.legacy_ics309)


def catalogue() -> List[dict]:
    """GET /api/report-sections: every section, in display order."""
    return [asdict(s) for s in REPORT_SECTIONS]


def validate_section_keys(keys: Optional[List[str]]) -> Optional[List[str]]:
    """Schema validator: unknown keys are an error; order and duplicates are
    normalized to the catalogue's order so stored lists compare equal."""
    if keys is None:
        return None
    unknown = sorted({k for k in keys if k not in SECTION_KEYS})
    if unknown:
        raise ValueError(f"Unknown report section(s): {', '.join(unknown)}")
    wanted = set(keys)
    return [s.key for s in REPORT_SECTIONS if s.key in wanted]


def dump_sections(keys: Optional[List[str]]) -> Optional[str]:
    """The TEXT column's value. None stays None (never set up); [] is kept."""
    return None if keys is None else json.dumps(keys)


def parse_sections(raw) -> Optional[List[str]]:
    """The column's value as a list, or None when never set up. Junk in the
    column reads as None (today's email) rather than failing a whole net
    fetch; unknown keys are dropped."""
    if raw is None:
        return None
    if isinstance(raw, list):
        parsed = raw
    else:
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            return None
    if not isinstance(parsed, list):
        return None
    return [s.key for s in REPORT_SECTIONS if s.key in set(p for p in parsed if isinstance(p, str))]


def is_available(key: str, settings, has_sites: bool) -> bool:
    """Whether the section's feature is on for *settings* (a Net, a
    NetTemplate, or anything with the same attribute names)."""
    section = _BY_KEY[key]
    if not section.requires_any:
        return True
    for name in section.requires_any:
        if name == "has_sites":
            if has_sites:
                return True
        elif getattr(settings, name, False):
            return True
    return False


def resolve_sections(settings, has_sites: bool) -> set:
    """The sections a closing email carries.

    Null report_sections: the legacy set for the net's own format (ICS-309
    when settings.ics309_enabled), which is exactly the email from before
    the Reports tab. Otherwise: the saved keys whose feature is on.
    """
    saved = parse_sections(getattr(settings, "report_sections", None))
    if saved is None:
        legacy = LEGACY_ICS309 if getattr(settings, "ics309_enabled", False) else LEGACY_PLAIN
        return {k for k in legacy if is_available(k, settings, has_sites)}
    return {k for k in saved if is_available(k, settings, has_sites)}


def sections_for_recipient(settings, has_sites: bool, prefers_ics309: bool) -> tuple[str, set]:
    """(format, sections) for one recipient.

    The ICS-309 format goes out when the net's sections include ics309_log
    or the recipient chose ICS-309 in their profile (User.notify_ics309).
    A never-set-up net sending ICS-309 to such a recipient uses the ICS-309
    legacy set, so that recipient's email is also unchanged.
    """
    sections = resolve_sections(settings, has_sites)
    use_ics309 = "ics309_log" in sections or bool(prefers_ics309)
    if use_ics309 and parse_sections(getattr(settings, "report_sections", None)) is None:
        sections = set(LEGACY_ICS309)
    return ("ics309" if use_ics309 else "plain"), sections


def is_legacy(settings) -> bool:
    return parse_sections(getattr(settings, "report_sections", None)) is None

