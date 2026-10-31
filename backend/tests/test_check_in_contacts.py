"""
A logged check-in is a two-way contact (services/site_coverage.py
check_in_contacts, station_reach).

Brad, 2026-10-30, after the SET (net 137): "Checked in does still mean two-way
communication has been made." The coverage rollup read only can-hear reports,
so WO1J at NWS Gray hearing WS1EC at the Bunker on 147.090 showed one-way,
though WS1EC had checked WO1J in on 147.090 an hour before. The contact is
placed where the logger was checked in at that moment (no streaming on ARES
nets, so a logger's own site is where they are).
"""
from datetime import datetime, timedelta, timezone

from app.services.site_coverage import (
    CheckInIn, ReportIn, SiteIn, build_site_coverage, check_in_contacts, station_reach,
)

T0 = datetime(2026, 10, 24, 11, 0, tzinfo=timezone.utc)
BUNKER = SiteIn(12, "CCEMA Bunker", "Windham, ME", "office", True)
GRAY = SiteIn(14, "NWS Gray", "Gray, ME", "office", False)
GORHAM = SiteIn(4, "Gorham MS", "Gorham, ME", "shelter", False)
WESTBROOK = SiteIn(9, "Westbrook HS", "Westbrook, ME", "shelter", False)

WS1EC = 110  # the Bunker's account, logging everyone
WO1J = 3
KD1OM = 50


def _row(id, callsign, site, user, logged_by, freq, minutes, out=None, **kw):
    return CheckInIn(id, callsign, site, user, logged_by, freq, T0 + timedelta(minutes=minutes),
                     None if out is None else T0 + timedelta(minutes=out), **kw)


def test_a_logged_check_in_is_a_contact_from_the_loggers_place():
    rows = [
        _row(1, "WS1EC", 12, WS1EC, WS1EC, 3, 0),     # NCS at the Bunker
        _row(2, "WO1J", 14, WO1J, WS1EC, 3, 40),      # logged by WS1EC on 147.090
    ]
    assert check_in_contacts(rows) == [ReportIn(1, 2, 3)]


def test_self_check_in_no_frequency_and_unrecorded_time_are_not_contacts():
    rows = [
        _row(1, "WS1EC", 12, WS1EC, WS1EC, 3, 0),
        _row(2, "WO1J", 14, WO1J, WO1J, 3, 40),        # checked himself in through the app
        _row(3, "KC1WGO", 12, None, WS1EC, None, 50),  # In person: no frequency
        _row(4, "W1AW", 14, None, WS1EC, 3, 60, time_not_recorded=True),
    ]
    assert check_in_contacts(rows) == []


def test_logger_place_is_where_they_were_at_that_moment():
    rows = [
        _row(1, "WS1EC", 12, WS1EC, WS1EC, 3, 0, out=60),   # Bunker until 60
        _row(2, "WS1EC", 14, WS1EC, WS1EC, 3, 60),          # then Gray
        _row(3, "KD1OM", 4, KD1OM, WS1EC, 3, 30),
        _row(4, "KD1OM", 9, KD1OM, WS1EC, 3, 90),
    ]
    assert check_in_contacts(rows) == [ReportIn(1, 3, 3), ReportIn(2, 4, 3)]


def test_logger_not_checked_in_anywhere_places_nothing():
    rows = [_row(2, "WO1J", 14, WO1J, WS1EC, 3, 40)]
    assert check_in_contacts(rows) == []


def test_one_report_plus_the_check_in_reads_two_way_between_sites():
    rows = [
        _row(1, "WS1EC", 12, WS1EC, WS1EC, 3, 0),
        _row(2, "WO1J", 14, WO1J, WS1EC, 3, 40),
    ]
    summary = build_site_coverage([BUNKER, GRAY], rows, [ReportIn(2, 1, 3)], [])
    link = next(l for l in summary["links"] if l["from_key"] == "site:14" and l["to_key"] == "site:12")
    assert link["two_way"] is True
    reach = next(r for r in summary["reach"] if r["site_key"] == "site:14")["targets"][0]
    assert reach["status"] == "two_way"


def test_station_reach_matches_a_recheck_at_the_same_place():
    # WO1J heard WS1EC from his 147.090 row; WS1EC logged him on DMR later,
    # at the same place. Different rows, same station and place.
    rows = [
        _row(1, "WS1EC", 12, WS1EC, WS1EC, 3, 0),
        _row(2, "WO1J", 14, WO1J, WO1J, 3, 40),
        _row(3, "WO1J", 14, WO1J, WS1EC, 5, 50),
    ]
    reach, proved = station_reach(rows, [ReportIn(2, 1, 3)])
    assert ("WS1EC|site:12", "WO1J|site:14", 5) in proved
    assert ("WS1EC|site:12", "WO1J|site:14", 3) not in reach  # nobody logged him on 147.090
