# Provenance

Code in this repository that was copied or ported from another bradbrownjr repository.
When the source changes, check it for fixes worth bringing over; when a file here improves,
offer the change back to the source. Paths are relative to each repository's root;
Source repo is the repository name, Source commit the commit the copy was taken from.

| Local path | Source repo | Source path | Source commit | Copied | Local changes |
|---|---|---|---|---|---|
| `backend/app/traffic/nts_text.py` | bpq-apps | `apps/forms.py` | e191a7a | 2026-08-02 | NTS text helpers only, table-driven; ? becomes QUERY; fallback count fixed |
| `backend/app/traffic/radiogram.py` | bpq-apps | `apps/forms.py` | e191a7a | 2026-08-03 | format_nts_radiogram rebuilt on nts_text; adds a tolerant importer |
| `backend/app/traffic/definitions/arl_messages.json` | bpq-apps | `apps/forms/arl_messages.json` | 789c6bb | 2026-08-02 | none |
| `backend/app/traffic/definitions/ics213.json` | bpq-apps | `apps/forms/ics213.frm` | eb1dbb2 | 2026-08-02 | converted from .frm to JSON |
| `backend/app/traffic/definitions/radiogram.json` | bpq-apps | `apps/forms/radiogram.frm` | e23ccc0 | 2026-08-02 | converted from .frm to JSON (form version 3.1) |
| `backend/app/traffic/definitions/rri_strip_general.json` | bpq-apps | `apps/forms/strip.frm` | eb1dbb2 | 2026-08-04 | converted from .frm to JSON |
| `backend/app/traffic/definitions/gyx_car_skywarn.json` | bpq-apps | `apps/forms/gyx-weather.frm` | 71d5144 | 2026-08-04 | converted from .frm to JSON |
