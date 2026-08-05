"""
Startup upsert of builtin form definitions from backend/app/traffic/definitions/*.json,
keyed on FormDefinition.form_type. See TRAFFIC-HANDLING-DESIGN.md D1.

Preservation strategy: an admin's only points of customization are
FormDefinition.is_enabled/sort_order and FormDefinitionField.label/description/
sort_order. Rather than trying to detect whether a stored value still matches
"what the JSON used to say" (fragile -- it can't tell an admin edit apart from
a JSON content fix that happens to produce the same string), this upsert uses
the simplest correct rule: those columns are written once, on insert, and
never touched again by a later upsert. Every other column is code-owned
structural metadata and is kept in sync with the JSON on every startup, so a
version bump's structural changes always take effect. New definitions and new
fields on an existing definition are inserted; nothing is ever deleted here,
so an admin's disable/reorder survives a version bump.
"""
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FormDefinition, FormDefinitionField

DEFINITIONS_DIR = Path(__file__).parent / "definitions"


def _load_manifest() -> dict:
    with open(DEFINITIONS_DIR / "manifest.json") as f:
        return json.load(f)


async def upsert_form_definitions(db: AsyncSession) -> None:
    manifest = _load_manifest()

    for filename, version in manifest.items():
        if filename == "arl_messages.json":
            continue  # data file for the ARL picker, not a form definition

        with open(DEFINITIONS_DIR / filename) as f:
            spec = json.load(f)

        form_type = spec["form_type"]
        result = await db.execute(
            select(FormDefinition).where(FormDefinition.form_type == form_type)
        )
        definition = result.scalar_one_or_none()

        if definition is None:
            definition = FormDefinition(
                form_type=form_type,
                title=spec["title"],
                description=spec.get("description"),
                version=version,
                output_format=spec.get("output_format", "generic"),
                is_builtin=True,
                is_enabled=True,
                sort_order=100,
            )
            db.add(definition)
            await db.flush()
        else:
            definition.title = spec["title"]
            definition.description = spec.get("description")
            definition.version = version
            definition.output_format = spec.get("output_format", "generic")
            # is_enabled and sort_order are admin-owned once set -- never touched here.

        fields_result = await db.execute(
            select(FormDefinitionField).where(FormDefinitionField.definition_id == definition.id)
        )
        existing_fields = {field.name: field for field in fields_result.scalars().all()}

        for field_spec in spec["fields"]:
            name = field_spec["name"]
            choices = field_spec.get("choices")
            choices_json = json.dumps(choices) if choices is not None else None
            existing = existing_fields.get(name)

            if existing is None:
                db.add(FormDefinitionField(
                    definition_id=definition.id,
                    name=name,
                    label=field_spec["label"],
                    field_type=field_spec.get("field_type", "text"),
                    description=field_spec.get("description"),
                    help_text=field_spec.get("help_text"),
                    is_required=field_spec.get("is_required", False),
                    max_length=field_spec.get("max_length"),
                    choices=choices_json,
                    validator=field_spec.get("validator"),
                    default_now=field_spec.get("default_now"),
                    auto_fill=field_spec.get("auto_fill"),
                    nts_normalize=field_spec.get("nts_normalize", False),
                    arl_enabled=field_spec.get("arl_enabled", False),
                    starts_new_section=field_spec.get("starts_new_section", False),
                    sort_order=field_spec.get("sort_order", 100),
                ))
            else:
                existing.field_type = field_spec.get("field_type", "text")
                existing.help_text = field_spec.get("help_text")
                existing.is_required = field_spec.get("is_required", False)
                existing.max_length = field_spec.get("max_length")
                existing.choices = choices_json
                existing.validator = field_spec.get("validator")
                existing.default_now = field_spec.get("default_now")
                existing.auto_fill = field_spec.get("auto_fill")
                existing.nts_normalize = field_spec.get("nts_normalize", False)
                existing.arl_enabled = field_spec.get("arl_enabled", False)
                existing.starts_new_section = field_spec.get("starts_new_section", False)
                # label, description, sort_order are admin-owned once set -- never touched here.

    await db.commit()
