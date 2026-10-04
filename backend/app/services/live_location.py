"""
A user's live (browser GPS) location: grid square plus the town it resolved to.

One rule for "is it fresh enough to use", shared by callsign lookup (what net
control's form fills in) and check-in creation/editing (whether the check-in
keeps the grid square behind the town it shows).
"""
from datetime import UTC, datetime, timedelta
from typing import Optional

from app.models import User

# A position older than this is treated as gone: the station may have moved,
# or closed the tab long ago, and the profile location is the better guess.
LIVE_LOCATION_MAX_AGE = timedelta(hours=1)


def fresh_live_location(user: Optional[User]) -> tuple[Optional[str], Optional[str]]:
    """(grid, town) from the user's live position, or (None, None) if stale/unset.

    town is None when the reverse lookup failed; the grid is still usable.
    """
    if not user or not user.live_location or not user.live_location_updated:
        return None, None
    age = datetime.now(UTC) - user.live_location_updated.replace(tzinfo=UTC)
    if age >= LIVE_LOCATION_MAX_AGE:
        return None, None
    return user.live_location, user.live_location_town


def live_location_display(user: Optional[User]) -> Optional[str]:
    """What a check-in location field should be filled with from the live position:
    the town net control can read on the air, or the grid if there is no town."""
    grid, town = fresh_live_location(user)
    return town or grid


def live_location_for_check_in(user: Optional[User], location: Optional[str]) -> Optional[str]:
    """The grid square to keep on a check-in whose location is `location`.

    Only when that location is the town the station's fresh live grid resolved
    to: that is the one case where the grid is known to describe the same place.
    A hand-typed or edited location gets None, so the hover never shows a grid
    for somewhere else.
    """
    grid, town = fresh_live_location(user)
    if grid and town and location and location.strip().lower() == town.lower():
        return grid
    return None
