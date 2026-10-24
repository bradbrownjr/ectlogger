"""What each built-in check-in field is called on this site.

The admin can rename a built-in field (Admin > Check-in fields: "Power" to
"Power (W)"), and FieldDefinition.label is where that lives. Anything a
person reads, such as the closing email's check-in table, takes the label
from here. The CSV exports keep fixed column names, because the CSV import
matches on them (services/csv_import.py).
"""
from typing import Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FieldDefinition

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


async def builtin_field_labels(db: AsyncSession) -> Dict[str, str]:
    """Every built-in field's label, the admin's wording where set."""
    rows = (await db.execute(
        select(FieldDefinition.name, FieldDefinition.label).where(FieldDefinition.is_builtin == True)  # noqa: E712
    )).all()
    return {**DEFAULT_FIELD_LABELS, **{name: label for name, label in rows if label}}
