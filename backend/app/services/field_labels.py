"""What each built-in check-in field is called on this site.

The admin can rename a built-in field (Admin > Check-in fields: "Power" to
"Power (W)"), and FieldDefinition.label is where that lives. Anything a
person reads, such as the closing email's check-in table, takes the label
from that row (services/check_in_columns.py), and from here when there is
none. The CSV exports keep fixed column names, because the CSV import
matches on them (services/csv_import.py).
"""
from typing import Dict

# The labels a fresh site starts with (routers/settings.py seeds the rows).
DEFAULT_FIELD_LABELS: Dict[str, str] = {
    "name": "Name",
    "location": "Location",
    "skywarn_number": "Spotter #",
    "weather_observation": "Weather",
    "power_source": "Power Src",
    "power": "Power",
    "feedback": "Feedback",
    "notes": "Notes",
    "relayed_by": "Relayed By",
}

