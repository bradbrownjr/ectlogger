# Assisted Traffic Handling & Forms — Design Notes

Last updated: 2026-08-02

This document locks the data model, API surface, frontend surface, and build sequence for
the **Assisted Traffic Handling & Forms (Radiograms)** roadmap item. It resolves the seven
design questions that item left open and records one blocker that only a human NTS/RRI
authority can close.

Related references:

- [docs/ROADMAP.md](../ROADMAP.md) > Milestone 1 > Assisted Traffic Handling & Forms — the
  scope, positioning constraints, and reference-implementation pointers this document builds on.
- [docs/DEVELOPMENT.md](../DEVELOPMENT.md) — router-facade pattern, frontend component-split
  pattern, migration template, AppSettings singleton, Date & Time Handling.
- [docs/DESIGN.md](../DESIGN.md) — read before building any UI listed in section 4.
- `bpq-apps` repo: `apps/forms.py`, `apps/forms/radiogram.frm`, `apps/forms/ics213.frm`,
  `apps/forms/arl_messages.json`, `apps/forms/manifest.json` — the field-tested plaintext
  RRI/NTS Radiogram implementation being **ported, not re-derived**.

---

## 0. Positioning constraint (binding on everything below)

ECTLogger never carries a message between operators. Messages move over a real net (voice,
CW, digital) or in person. This feature helps the operator who originates, relays, or
delivers traffic fill out the form correctly, remember to follow through, and keep a record.

Practical consequences that shaped the design:

- No endpoint is named `send`, `route`, or `deliver`. The verbs are `log`, `record`,
  `export`, `remind`.
- The relay/delivery log records **what the operator says happened on the air**. ECTLogger
  is a witness, not a transport.
- An ECTLogger-sent "send it for me" email was considered for Stage B and **rejected** by
  the roadmap author (2026-08-03) precisely because it was the one place this constraint was
  genuinely at risk — see Risk R7 (resolved). Stage B only ever *records* that an operator
  delivered a piece of traffic by email; it never sends the traffic itself.

---

## 1. Decisions on the seven open questions

Each decision is stated, then justified. These are the expensive-to-reverse calls; the rest
of the document is the consequence of them.

### D1 — Form definitions: code-owned builtin definitions, admin-configurable but not admin-authored

**Decision.** Form definitions live as versioned JSON files in `backend/app/traffic/definitions/`
(ported verbatim in structure from `bpq-apps`'s `.frm` files, including the `manifest.json`
version map), and are **upserted into a `form_definitions` table at application startup**,
keyed on `form_type`. Builtin definitions carry `is_builtin = True`. An admin can enable or
disable a definition, reorder it, and override a field's `label`/`help` text per instance.
An admin **cannot** add, remove, or retype a field on a builtin definition. Authoring a
wholly new form type is deferred to a later phase and is only ever permitted for
`output_format = 'generic'` definitions, which no formatter is coupled to.

**Rationale.**

- The radiogram is not a rendering of an arbitrary field list. Its output is a protocol:
  preamble word order, exactly two `BT` breaks, a check that must match a word count, and
  5-word body grouping. `format_nts_radiogram` in the reference reads specific field names
  (`number`, `precedence`, `handling`, `station_of_origin`, `place_of_origin`, `to_name`,
  `to_callsign`, `to_address`, `to_city_state`, `to_zip`, `to_phone`, `to_email`, `text`,
  `signature`, `filed_time`). A schema editor that lets an admin rename `to_zip` produces
  radiograms that are wrong on the air. That is precisely the failure mode the traffic
  community will judge this feature on.
- But the `.frm` JSON **is** already a good definition format, field-tested, versioned, and
  it drives a generic renderer. Keeping it as data buys us: one React form renderer instead
  of one per form type, per-field validation metadata for free, and a real upgrade path for
  ICS-213RR and the `vden.org/pktnet` formats without a schema migration.
- The codebase already has this exact pattern: `FieldDefinition` (check-in fields) carries
  `is_builtin`, `is_archived`, `sort_order`, and admin-editable `label`, with the builtin
  system fields protected. `form_definitions` is the same shape applied to a new domain, so
  the Admin tab that manages it is a near-copy of `AdminFieldsTab.tsx`.

**Consequence.** A definition change ships in a release, not a config edit. Accepted — see
Risk R6.

### D2 — Radiogram modeled as: generic JSON value storage plus promoted columns, with a dedicated formatter module

**Decision.** Three tables, not one:

- `form_definitions` + `form_definition_fields` — the **schema** side. This is where the
  roadmap's `FormField` lives; it is a template, not a value.
- `forms` — the **instance**. Field values are stored as a single JSON `Text` column
  (`field_values`), alongside a fixed set of **promoted columns** for everything that must
  be filtered, sorted, indexed, or reported on.

The radiogram's "dedicated structure" need is a **formatting and validation** need, not a
storage need. It is satisfied by a dedicated module, `app/traffic/radiogram.py`, selected by
`FormDefinition.output_format == 'nts_radiogram'`. No radiogram-specific table.

**Rationale.**

- Storing values as JSON with promoted columns is the codebase's existing idiom, not a new
  invention: `CheckIn` promotes `callsign`, `location`, `skywarn_number`, `status` to real
  columns and dumps everything else into `custom_fields` (JSON in `Text`).
  `Net.field_config`, `NetTemplate.schedule_config`, and `User.callsigns` all do the same.
- Entity-attribute-value (a `form_field_values` row per field) was rejected. A radiogram is
  15 fields; every list view would join 15 rows per record, and a form instance is always
  read whole and never field-by-field. EAV buys queryability we get more cheaply by
  promoting the six fields that actually get queried.
- A dedicated `radiograms` table was rejected because it forces every consumer (list view,
  search, inbox, log, stats, export) to branch on form type at the storage layer. Branching
  belongs in one place: the formatter registry.

**Promoted columns and why each is promoted** (full definitions in section 2):

| Column | Promoted because |
|---|---|
| `message_number` | Operators search by NTS number constantly. |
| `precedence` | Drives the reminder ladder (D4) and is the primary list filter. |
| `handling` | HXB/HXC/HXD change reminder and reporting behavior; must be queryable. |
| `station_of_origin` | Search, and the HXD chain report groups by it. |
| `subject` | The one-line list label; computed once at write, not per render. |
| `addressee_display` | List column and search target. |
| `check_count` / `check_stated` | Both stored so an import mismatch stays visible forever. |
| `normalized_text` | The authoritative body. Stored so the check and the export can never drift from each other. |

The raw, pre-normalization text the operator typed is kept in `field_values` under
`text_raw`, so the operator can see what they wrote and the normalization can be re-run if
the substitution table changes (which it will — see section 5).

### D3 — Visibility: submitter, current holder, everyone in the chain of custody, the net's NCS/logger, and admins

**Decision.** A `Form` row is viewable by:

1. The submitter (`created_by_id`).
2. The current holder (`held_by_user_id`).
3. Any user named as `reported_by_user_id` or `handed_to_user_id` on any
   `traffic_log_entries` row for that form — that is, **anyone in the chain of custody**.
4. If `net_id` is set: anyone passing
   `check_net_permission(db, net, user, required_roles=["ncs", "logger"])`.
5. Global admins (already covered by `is_admin` inside `check_net_permission`).

Nobody else. Ordinary check-ins on the net do **not** get to read the net's traffic. A form
filed outside a net (`net_id IS NULL`) is visible only to 1, 2, 3, and 5.

**Editability is separate and stricter.** A form becomes **append-only the moment it has any
log entry**. Before that (disposition `draft`), the submitter and the net's NCS may edit
field values. After that, `PATCH` returns 409 and corrections are made by appending a log
entry or originating a service message — never by silently rewriting the text of a message
that has already been passed on the air. This is both a real traffic-handling norm and the
simplest possible answer to "who can edit".

**Rationale.**

- Welfare and health-and-welfare traffic contains a private individual's name, street
  address, phone number, and email. This is the most sensitive data ECTLogger has ever
  stored. Least-privilege is the default, and "everyone on the net can read it" is not
  defensible.
- Chain-of-custody visibility (rule 3) is not a convenience; it is what HXD requires. If you
  handled a message you must be able to report on your handling of it.
- Rule 4 is a direct roadmap requirement: "that net's manager can see the delivery status of
  everything logged during their net rather than losing visibility once the net closes."
  Restricting it to `ncs`/`logger` rather than all `check_net_permission` callers is
  deliberate; `check_net_permission` with no `required_roles` is owner-or-admin only, and
  the logger is exactly the person who typed the traffic into the log.

**Implementation.** A new `check_form_permission(db, form, user, level)` in
`app/permissions.py`, next to the existing helpers, with `level` in `("view", "manage")`.
Critically, list endpoints must apply the visibility rule as a **WHERE clause**, not as a
post-fetch filter, or pagination counts leak the existence of traffic the caller cannot see.

**ICS-309 consequence.** Traffic appears on the net's ICS-309 export as **metadata only** —
number, precedence, handling, action, addressee city, handling station. The message body is
never written to ICS-309, in any format, ever. Today `export_net_ics309` is gated by
`check_net_permission(db, net, current_user)` with no roles (owner or admin only), but that
gate could reasonably be widened later, and this rule means widening it can never
retroactively leak a welfare message.

### D4 — Reminder cadence: precedence-scaled escalating ladder, three emails maximum, passive escalation to the net

**Decision.**

Reminders are computed from `held_since` (when the item landed in the current holder's
inbox), never from filing time. The ladder by precedence:

| Precedence | Stage 1 | Stage 2 | Stage 3 | Then |
|---|---|---|---|---|
| Emergency | 1 h | 4 h | 12 h | stop, mark stale |
| Priority | 4 h | 12 h | 24 h | stop, mark stale |
| Welfare / Routine (default) | 24 h | 72 h | 7 days | stop, mark stale |
| ICS-213 `Urgent` / `Emergency` | maps to Priority / Emergency | | | |
| ICS-213 `Routine`, no precedence at all | default ladder | | | |

- **Three emails maximum** per holder per form. Escalating intervals, not a daily nag. The
  roadmap's word is "gently."
- **First reminder is never same-session.** The 24 h default exists so a routine reminder
  cannot fire while the operator is still sitting at the net they copied it on.
- **HXB(n) overrides the ladder entirely**: reminder at `n/2` hours, and at `n` hours a hard
  "cancel and notify origin" prompt rather than a fourth nudge, matching what HXB actually
  instructs.
- **Escalation to the NCS: yes, but passive by default.** After the last stage expires with
  no new log entry, the form is stale and is counted in the originating net's
  "Outstanding traffic" badge, visible to that net's NCS/logger/owner in the per-net traffic
  panel. No per-item email to the NCS. An opt-in `traffic_escalation_digest` toggle on the
  net template sends the manager **one weekly digest** of stale items from their nets.
  Rationale: NCS burnout is real, a badge in a view they already open is the right default,
  and ARES groups that need active chasing can switch the digest on.
- **Windows are one-sided**, reusing `NCSReminderService._in_reminder_window`'s shape
  (`stage_hours - catch_up <= elapsed`), never a symmetric tolerance. This is a documented
  rule in DEVELOPMENT.md and the June/July 2026 reminder bugs came from violating it.
- **Deduplication** via a `traffic_reminder_logs` table with
  `UniqueConstraint(form_id, user_id, stage)`, modeled directly on `WhatsNewSendLog`'s
  cross-process atomic-insert lock (whichever uvicorn worker inserts first wins; the second
  gets `IntegrityError` and skips).
- **Eligibility is derived, not flagged.** A form drops out of the ladder the instant a log
  entry newer than `held_since` exists, because that is what the eligibility query tests.
  There is no "reminders off" boolean to forget to clear.
- **Opt-out** honors `User.email_notifications` (master switch) plus a new
  `User.notify_traffic_reminder`, **defaulting to True**. Unlike the What's New digest, this
  is an operational obligation the user took on by accepting traffic; it should not require
  discovering a setting.

### D5 — Import: always partial-parse, never reject, and never commit without human confirmation

**Decision.** The importer is **stateless and parse-only**. `POST /traffic/import/preview`
returns a parse result and writes nothing. The user reviews the result in the ordinary form
editor, pre-filled, and submits through the normal create endpoint. A bad parse therefore
cannot create a bad record — the human is always the commit step.

Tolerance rules:

- **Type detection by shape.** A first line matching the preamble pattern (`NR` followed by
  a number and a precedence letter) means radiogram. Otherwise, try ICS-213 label matching.
  Otherwise, return `form_type: "unknown"` with the entire input preserved in a free-text
  field, so nothing the operator pasted is ever lost.
- **`BT` breaks are preferred, not required.** Exactly two `BT` lines: use them. Missing or
  malformed: fall back to positional heuristics (line 1 is the preamble; the address block
  runs until the last line beginning `TEL` / `EMAIL` or the line carrying the ZIP; the last
  non-empty line is the signature; the remainder is the body). Every heuristic used emits a
  named warning.
- **Reflowed lines are harmless.** The body is re-joined on whitespace and re-split into
  5-word groups on output. Five-word grouping is presentation, never semantics, and the
  parser must not depend on it.
- **The check is never trusted from the wire.** Recompute with `count_nts_check` over the
  parsed body and store both `check_stated` (what the text claimed) and `check_count` (what
  we computed). A mismatch is a prominent warning — "stated check 12, computed 11, verify
  with the sending station" — and never an error. This is exactly what a human traffic
  handler does on receipt, and it is the single most valuable thing the importer can do.
- **Field validators run in advisory mode.** A `callsign`, `us_zip`, or `hhmm` validator
  failure marks the field low-confidence and highlights it in the review screen. It does not
  block.
- **Hard failure only on** empty input or input above a size cap (32 KB). Everything else
  parses to something.

Per-field the response carries `value`, `source` (`bt_block` / `heuristic` / `label_match` /
`unparsed`), and `confidence` (`high` / `low`), so the review UI can draw attention exactly
where the parse guessed.

**Rationale.** Hand-relayed text is lossy by definition. A rejecting parser means the
operator retypes fifteen fields, which is the precise toil this feature exists to remove. A
partial parse that recovers twelve of fifteen fields is a clear win even when it is wrong
about three, **provided** the operator sees and confirms every field before anything is
written.

### D6 — Relay method is a fixed enum; net/path name stays free text. Enum finalized at eight values

**Confirmed and finalized.**

```python
class RelayMethod(str, enum.Enum):
    VOICE_NET  = "voice_net"    # HF/VHF/UHF voice net, repeater or simplex
    CW_NET     = "cw_net"       # CW traffic net
    DIGITAL_NET = "digital_net" # packet, Winlink, VARA, FLdigi, NTSD, DMR data
    PHONE      = "phone"        # telephone or SMS
    EMAIL      = "email"        # direct email to the addressee
    IN_PERSON  = "in_person"    # hand delivered
    POSTAL     = "postal"       # mailed card or letter
    OTHER      = "other"        # requires method_note
```

Two additions beyond the roadmap's list (digital / CW / voice / phone / in-person / other):

- **`EMAIL`** — delivering a radiogram to the addressee by email is extremely common.
  Folding it into `DIGITAL_NET` would conflate *how the message moved on a net* with *how it
  reached the addressee*, and those are different categories for HXD reporting and for
  delivery statistics.
- **`POSTAL`** — mailing a card is still in ARRL delivery guidance. Without it these land in
  `OTHER`, which defeats the purpose of having an enum for statistics.

Deliberately **not** in the enum: anything naming a specific network (NTSD, Winlink,
Brandmeister, a repeater). Those are local and go in free text.

Free text, never a lookup table, never validated against `Frequency`:

- `path_name` — `String(200)`, nullable. "Pine Tree Net", "Seagull Net", "NTSD MPG",
  "146.940 W1MTW". Every self-hosted instance's local nets differ; a hardcoded list is
  guaranteed wrong somewhere.
- `handed_to` — `String(200)`, nullable. Callsign or name, or the addressee.
- `method_note` — `String(255)`, required when `method == OTHER`.

One structured escape hatch: `handed_to_user_id`, a nullable FK to `users`, set **only** when
the receiving operator is a known ECTLogger account. This is what moves the item into that
operator's inbox. Free text is the fallback and the common case; the FK is an optimization
for the case where both operators use the same instance.

### D7 — Full chain of custody, append-only, with disposition derived from the chain

**Confirmed: full chain.** HXD is literally "report the relay and delivery chain to the
originating station." A single-hop record cannot answer the only question HXD asks, so
single-hop is not an option here.

`traffic_log_entries` holds one append-only row per hop, ordered by `sequence` (1-based,
per form) with `occurred_at`. Actions:

| Action | Meaning | Terminal? |
|---|---|---|
| `ORIGINATED` | The message was created at this station. Sequence 1 for originated traffic. | no |
| `RECEIVED` | This station copied it off the air or in person. Sequence 1 for inbound traffic. | no |
| `RELAYED` | This station passed it onward to another station or net. | no |
| `DELIVERED` | This station delivered it to the addressee. | yes |
| `SERVICED` | A service message was originated back to the origin (HXC/HXD/HXE reporting, or an undeliverable notice). | no, annotation only |
| `CANCELLED` | The message was killed (HXB expiry, origin cancelled). | yes |

**Disposition is derived, never stored as an independent flag** (a roadmap requirement, and
correct — a flag and a log always drift):

- no entries → `draft`
- last non-`SERVICED` entry is `ORIGINATED` or `RECEIVED` → `pending` (in an inbox,
  reminder-eligible)
- `RELAYED` → `relayed`
- `DELIVERED` → `delivered`
- `CANCELLED` → `cancelled`

`SERVICED` never changes disposition; it is an annotation on the chain.

**What makes this tractable, and what we explicitly do not attempt.** ECTLogger records
**this instance's view** of the chain, seeded by whatever the operator was told when they
received the message. We do **not** attempt to reconcile chains across instances or across
stations. `TrafficLogEntry.reported_by_user_id` records who asserted each entry, so an entry
entered second-hand ("KY2D told me he had it from W1AW") is structurally distinguishable
from a first-hand one. Chain-of-custody data models get frightening when they try to be a
distributed ledger; this one is a logbook.

The UI cost is also smaller than it sounds: the chain is an append-only timeline component,
not a CRUD grid, and each entry is one dialog with five fields.

---

## 2. Locked data model

All new tables follow current `models.py` reality, not the aspirational future state:

- **Datetimes use `Column(DateTime(timezone=True), server_default=func.now())`.** There is
  no `UTCDateTime` `TypeDecorator` in the codebase today (verified: no `TypeDecorator` and
  no `app/types.py`), so UTC is naive-by-convention on SQLite exactly as documented in
  DEVELOPMENT.md's "Current storage caveat". New code must **not** invent the decorator
  ahead of the roadmap's UTC-hardening item; it must be a clean sweep, not a partial one.
- Enums use `Column(Enum(TheEnum))` with a `str, enum.Enum` base, matching `NetStatus` and
  `StationStatus`.
- JSON-shaped data uses `Column(Text)` with a JSON string, matching `CheckIn.custom_fields`.
- Foreign keys to `nets` use `ondelete="CASCADE"` where the child is meaningless without the
  net, `ondelete="SET NULL"` where it survives.

New enums live in `models.py` alongside the existing ones.

```python
class FormDisposition(str, enum.Enum):
    """Derived from the traffic log, never stored. Defined here so schemas and
    query filters share one vocabulary."""
    DRAFT = "draft"
    PENDING = "pending"
    RELAYED = "relayed"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class TrafficAction(str, enum.Enum):
    ORIGINATED = "originated"
    RECEIVED = "received"
    RELAYED = "relayed"
    DELIVERED = "delivered"
    SERVICED = "serviced"
    CANCELLED = "cancelled"


class RelayMethod(str, enum.Enum):
    VOICE_NET = "voice_net"
    CW_NET = "cw_net"
    DIGITAL_NET = "digital_net"
    PHONE = "phone"
    EMAIL = "email"
    IN_PERSON = "in_person"
    POSTAL = "postal"
    OTHER = "other"
```

### 2.1 `form_definitions` — the form schema (builtin, seeded from repo JSON)

```python
class FormDefinition(Base):
    """A form type available on this instance. Builtins are seeded and upserted
    from backend/app/traffic/definitions/*.json at startup, keyed on form_type.
    Admins may enable/disable, reorder, and override labels; they may not change
    a builtin's field set. See TRAFFIC-HANDLING-DESIGN.md D1."""
    __tablename__ = "form_definitions"

    id = Column(Integer, primary_key=True, index=True)
    form_type = Column(String(32), unique=True, index=True, nullable=False)   # "RADIOGRAM", "ICS213"
    title = Column(String(120), nullable=False)                               # "ARRL Radiogram"
    description = Column(Text)
    version = Column(String(16), nullable=False)                              # "3.1", from manifest.json
    output_format = Column(String(32), nullable=False, default='generic')     # "nts_radiogram" | "generic"
    is_builtin = Column(Boolean, default=True)      # field set is code-owned and not editable
    is_enabled = Column(Boolean, default=True)      # admin toggle, per instance
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    fields = relationship(
        "FormDefinitionField",
        back_populates="definition",
        cascade="all, delete-orphan",
        order_by="FormDefinitionField.sort_order",
    )
    forms = relationship("Form", back_populates="definition")
```

### 2.2 `form_definition_fields` — one row per field in a definition

Ported one-for-one from the `.frm` field objects. This is the roadmap's `FormField`: it
belongs on the **template** side, not the value side.

```python
class FormDefinitionField(Base):
    __tablename__ = "form_definition_fields"

    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey("form_definitions.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    name = Column(String(64), nullable=False)        # "to_city_state" — stable key into Form.field_values
    label = Column(String(120), nullable=False)      # admin-overridable display label
    field_type = Column(String(20), nullable=False, default='text')  # text|textarea|choice|yesno
    description = Column(Text)                       # admin-overridable helper text
    help_text = Column(Text)                         # multi-line help (the HX code list)
    is_required = Column(Boolean, default=False)
    max_length = Column(Integer, nullable=True)
    choices = Column(Text, nullable=True)            # JSON array for field_type == 'choice'
    validator = Column(String(32), nullable=True)    # "callsign" | "us_zip" | "hhmm" | "city_state" | "phone" | "email" | "nts_number" | "hx_code"
    default_now = Column(String(16), nullable=True)  # strftime format for auto-fill, e.g. "%H%M"
    auto_fill = Column(String(32), nullable=True)    # "callsign" | "place_of_origin" | "signature"
    nts_normalize = Column(Boolean, default=False)   # run normalize_nts_text + count_nts_check on this field
    arl_enabled = Column(Boolean, default=False)     # offer the ARL numbered-message picker
    sort_order = Column(Integer, default=100)

    definition = relationship("FormDefinition", back_populates="fields")

    __table_args__ = (
        UniqueConstraint('definition_id', 'name', name='uq_form_definition_field_name'),
    )
```

### 2.3 `forms` — the form instance

```python
class Form(Base):
    """A submitted form instance (a piece of formal traffic). Values live in
    field_values as JSON; the columns below are promoted because they are
    filtered, sorted, or reported on. Disposition is NOT stored — it is derived
    from traffic_log_entries. See TRAFFIC-HANDLING-DESIGN.md D2 and D7."""
    __tablename__ = "forms"

    id = Column(Integer, primary_key=True, index=True)
    definition_id = Column(Integer, ForeignKey("form_definitions.id"), nullable=False)
    form_type = Column(String(32), nullable=False, index=True)     # denormalized for cheap filtering
    definition_version = Column(String(16), nullable=False)        # version in force at submit time

    # Association — nullable so a form can be filed outside any net
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # All field values, keyed by FormDefinitionField.name. Includes "text_raw"
    # (what the operator typed, pre-normalization) for radiograms.
    field_values = Column(Text, nullable=False, default='{}')

    # ---- Promoted columns (see D2) ----
    subject = Column(String(255))                  # one-line list label, computed at write
    addressee_display = Column(String(255))        # "JIM KUTSCH KY2D" / "PORTLAND ME"
    message_number = Column(String(16), index=True)
    precedence = Column(String(16), index=True)    # "R"|"W"|"P"|"E" for radiogram; ICS-213 word otherwise
    handling = Column(String(32))                  # HX codes, e.g. "HXD" or "HXB48"
    station_of_origin = Column(String(20), index=True)
    check_count = Column(Integer, nullable=True)   # computed by count_nts_check, authoritative
    check_stated = Column(Integer, nullable=True)  # what an imported text claimed; null when we originated
    normalized_text = Column(Text)                 # post-normalize_nts_text body, authoritative for export

    # ---- Derived-and-cached (single writer: app/traffic/log.py::append_entry) ----
    held_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                             nullable=True, index=True)
    held_since = Column(DateTime(timezone=True), nullable=True)
    last_action = Column(Enum(TrafficAction), nullable=True)   # drives disposition without a join

    filed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    definition = relationship("FormDefinition", back_populates="forms")
    net = relationship("Net", back_populates="forms")
    created_by = relationship("User", foreign_keys=[created_by_id])
    held_by = relationship("User", foreign_keys=[held_by_user_id])
    log_entries = relationship(
        "TrafficLogEntry",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="TrafficLogEntry.sequence",
    )

    __table_args__ = (
        Index('ix_forms_inbox', 'held_by_user_id', 'held_since'),
        Index('ix_forms_net_filed', 'net_id', 'filed_at'),
    )
```

`held_by_user_id`, `held_since`, and `last_action` are a **deliberate denormalization**, and
the mitigation is that they have exactly **one writer**: `app/traffic/log.py::append_entry`,
which updates them in the same transaction as the log insert. A `recompute_form_cache(form)`
helper rebuilds all three from the log and is exercised by a test, so the cache is provably
reconstructible. See Risk R2.

Relationship added to `Net`:

```python
    # in class Net
    forms = relationship("Form", back_populates="net")   # no cascade: traffic outlives the net
```

Note the deliberate absence of `cascade="all, delete-orphan"` here, unlike `check_ins` and
`chat_messages`. A piece of traffic is a record with an obligation attached to it and must
survive the deletion of the net it was copied on; the FK is `ondelete="SET NULL"` for the
same reason.

### 2.4 `traffic_log_entries` — the chain of custody

```python
class TrafficLogEntry(Base):
    """One hop in a form's chain of custody. Append-only; corrections are made by
    appending, not rewriting. Disposition is derived from the newest non-SERVICED
    entry. See TRAFFIC-HANDLING-DESIGN.md D7."""
    __tablename__ = "traffic_log_entries"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    sequence = Column(Integer, nullable=False)          # 1-based position in the chain
    action = Column(Enum(TrafficAction), nullable=False)

    # How it moved. Null for ORIGINATED and for SERVICED annotations.
    method = Column(Enum(RelayMethod), nullable=True)
    method_note = Column(String(255), nullable=True)    # required when method == OTHER
    path_name = Column(String(200), nullable=True)      # free text: "Pine Tree Net", "NTSD MPG"

    # Who it went to. Free text is the common case; the FK is set only when the
    # receiving operator is a known account on this instance, and is what moves
    # the item into their inbox.
    handed_to = Column(String(200), nullable=True)
    handed_to_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                               nullable=True, index=True)

    # Who asserted this entry. Distinguishes first-hand from second-hand records.
    reported_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                                 nullable=True, index=True)
    # The net this hop happened on, when it was an ECTLogger-logged net.
    net_id = Column(Integer, ForeignKey("nets.id", ondelete="SET NULL"), nullable=True, index=True)

    note = Column(Text, nullable=True)                  # free-form operator note
    occurred_at = Column(DateTime(timezone=True), nullable=False)   # when it happened (operator-editable)
    created_at = Column(DateTime(timezone=True), server_default=func.now())  # when it was recorded

    form = relationship("Form", back_populates="log_entries")
    handed_to_user = relationship("User", foreign_keys=[handed_to_user_id])
    reported_by = relationship("User", foreign_keys=[reported_by_user_id])
    net = relationship("Net")

    __table_args__ = (
        UniqueConstraint('form_id', 'sequence', name='uq_traffic_log_form_sequence'),
    )
```

`occurred_at` and `created_at` are separate on purpose. An operator logging Tuesday's net on
Wednesday morning must be able to state when the handoff actually happened without falsifying
when the record was made.

### 2.5 The delivery inbox — a query, not a table

**Decision: the inbox is not a table.** It is:

```
SELECT * FROM forms
WHERE held_by_user_id = :me
  AND last_action IN ('originated', 'received')
ORDER BY held_since ASC
```

served by the composite index `ix_forms_inbox`.

An inbox table would be a third place the truth lives, after the log and the cached fields,
and it would need its own reconciliation. The cached `held_by_user_id` / `last_action`
columns already make this a single-table indexed lookup, which is all an inbox table would
have bought.

An item **enters** an inbox when a log entry names its recipient: `RECEIVED` sets
`held_by_user_id = reported_by_user_id`; `RELAYED` with a known `handed_to_user_id` moves it
to that operator; `RELAYED` to an unknown operator clears `held_by_user_id` (the message left
this instance's visibility, and nobody should be reminded about it). `DELIVERED` and
`CANCELLED` clear it too.

### 2.6 `traffic_reminder_logs` — send deduplication

```python
class TrafficReminderLog(Base):
    """One row per reminder actually sent. The UNIQUE constraint is the atomic
    cross-process lock, exactly as in whats_new_send_log: whichever worker
    INSERTs first wins and the other gets IntegrityError and skips."""
    __tablename__ = "traffic_reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("forms.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    stage = Column(Integer, nullable=False)        # 1, 2, or 3
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    form = relationship("Form")
    user = relationship("User")

    __table_args__ = (
        UniqueConstraint('form_id', 'user_id', 'stage', name='uq_traffic_reminder_form_user_stage'),
    )
```

### 2.7 Additive columns on existing tables

| Table | Column | Type / default | Purpose |
|---|---|---|---|
| `users` | `notify_traffic_reminder` | `Boolean, default=True` | Per-user opt-out of the delivery reminder ladder. Defaults on, unlike the digest. |
| `nets` | `traffic_enabled` | `Boolean, default=True` | Per-net switch for the traffic panel. On by default; a chatty SKYWARN net can hide it. |
| `net_templates` | `traffic_enabled` | `Boolean, default=True` | Seeds the net value, matching `ics309_enabled` / `propagation_logging_enabled`. |
| `net_templates` | `traffic_escalation_digest` | `Boolean, default=False` | Opt-in weekly stale-traffic digest to the schedule's manager (D4). |
| `app_settings` | `traffic_reminder_enabled` | `Boolean, default=True` | Instance master switch for the reminder service. |

All follow the AppSettings singleton pattern in DEVELOPMENT.md (column, then
`AppSettingsResponse`/`AppSettingsUpdate`, then `_build_settings_response()` and the
`update_settings` handler, then a migration).

### 2.8 Migrations

Latest existing migration is `051_add_propagation_logging_enabled.py`. New work starts at
`052_`, one migration per build phase rather than one giant script, each using the
`sqlite3`-direct template in DEVELOPMENT.md:

- `052_add_traffic_tables.py` — `form_definitions`, `form_definition_fields`, `forms`,
  `traffic_log_entries`, plus the two composite indexes.
- `053_add_traffic_reminder_log.py` — `traffic_reminder_logs`, `users.notify_traffic_reminder`.
- `054_add_traffic_settings.py` — `nets.traffic_enabled`, `net_templates.traffic_enabled`,
  `net_templates.traffic_escalation_digest`, and the two `app_settings` columns.

Per `backend/migrations/README.md`, these carry schema only. Definition **content** is
seeded by the startup upsert in `app/traffic/definitions.py`, never by a migration, so a
self-hoster gets the current definitions from the code they installed rather than inheriting
a replay of every historical definition edit.

---

## 3. API surface

New facade router `backend/app/routers/traffic.py`, following the pattern in
DEVELOPMENT.md ("Backend router-split (facade) pattern"). It is a facade from day one
because the surface is already four themed groups and would otherwise repeat the
`nets.py` / `templates.py` growth story.

```python
# routers/traffic.py (facade — the whole file, give or take)
from fastapi import APIRouter
from app.routers.traffic_definitions import router as traffic_definitions_router
from app.routers.traffic_forms import router as traffic_forms_router
from app.routers.traffic_log import router as traffic_log_router
from app.routers.traffic_export import router as traffic_export_router

router = APIRouter(prefix="/traffic", tags=["traffic"])
router.include_router(traffic_definitions_router)
router.include_router(traffic_forms_router)
router.include_router(traffic_log_router)
router.include_router(traffic_export_router)
```

Registered in `main.py` alongside the other routers.

Supporting non-router modules (not in `routers/`, because they are domain logic reused by
the router, the reminder service, and the ICS-309 exporter):

```
backend/app/traffic/
├── __init__.py
├── nts_text.py        # normalize_nts_text, count_nts_check, NTS_SUBSTITUTIONS (section 5)
├── radiogram.py       # format_nts_radiogram, parse_nts_radiogram, preamble build
├── ics213.py          # format/parse for the second form type
├── formatters.py      # output_format -> module registry; the only place that branches on form type
├── definitions.py     # startup upsert from definitions/*.json
├── log.py             # append_entry (the single writer of the cached fields), derive_disposition
├── arl.py             # ARL numbered-message catalog loader
└── definitions/
    ├── manifest.json
    ├── radiogram.json
    ├── ics213.json
    └── arl_messages.json
```

### 3.1 `traffic_definitions.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/traffic/definitions` | user | Enabled definitions with their field lists, for the renderer and the type picker. |
| GET | `/traffic/definitions/{form_type}` | user | One definition with full field schema. |
| PUT | `/traffic/definitions/{id}` | admin | `is_enabled`, `sort_order`, and per-field `label`/`description` overrides. Rejects any attempt to change the field set of a builtin. |
| GET | `/traffic/arl-messages` | user | The ARL numbered-message catalog (`num`, `word`, `group`, `text`, `blanks`) for the picker. Static, cached in-process. |

### 3.2 `traffic_forms.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/traffic/forms` | user | Create. Body carries `form_type`, optional `net_id`, `field_values`, and an optional initial log entry. Server-side: normalize, compute check, promote columns, insert the `ORIGINATED`/`RECEIVED` entry — all in one transaction. |
| GET | `/traffic/forms` | user | Paginated list/search, visibility-scoped in the WHERE clause (D3). Filters: `q`, `form_type`, `net_id`, `disposition`, `precedence`, `handling`, `mine`, `held_by_me`, `stale`, `date_from`, `date_to`. |
| GET | `/traffic/forms/{id}` | view perm | Full instance: promoted columns, `field_values`, definition snapshot, log entries, derived disposition, rendered plaintext preview. |
| PATCH | `/traffic/forms/{id}` | manage perm | Edit field values. **409 if any log entry exists** (append-only rule, D3). |
| DELETE | `/traffic/forms/{id}` | submitter-while-draft, or admin | Remove a mis-filed draft. |
| GET | `/traffic/nets/{net_id}/forms` | net view perm | The per-net panel's list. Path shape matches the existing `/check-ins/nets/{net_id}/check-ins` precedent. |
| GET | `/traffic/nets/{net_id}/summary` | net view perm | Counts by disposition plus the outstanding/stale count for the manager badge. |

**The check is always computed server-side.** The client's live counter (section 4) is a
preview; `POST` and `PATCH` recompute from `text_raw` and ignore any client-supplied check.
There is exactly one authoritative implementation and it is the Python one.

### 3.3 `traffic_log.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/traffic/forms/{id}/log` | view perm on the form | Append a hop: `action`, `method`, `method_note`, `path_name`, `handed_to`, `handed_to_user_id`, `net_id`, `occurred_at`, `note`. Assigns `sequence`, updates the cached fields in the same transaction. |
| GET | `/traffic/forms/{id}/log` | view perm | The chain, for the timeline panel's refresh. Also embedded in the form GET. |
| DELETE | `/traffic/forms/{id}/log/{entry_id}` | admin | **Last entry only.** Exists for genuine mis-clicks; the normal correction path is appending. |
| GET | `/traffic/inbox` | user | The caller's pending-held traffic plus a count. Drives the navbar badge and the Profile view. Deliberately cheap — index-only. |

Anyone with view permission may append, because in real traffic handling the person who
knows a message moved is whoever moved it, and that is often not the submitter.

### 3.4 `traffic_export.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/traffic/forms/{id}/export` | view perm | `?format=text` (the only format) returns the RRI/NTS plaintext (ported formatter). **Revision (2026-08-03):** the printable PDF used to be generated here too (a reportlab monospace text dump) but is gone — see section 4.6's note on `RadiogramPrintView.tsx`/`ICS213PrintView.tsx`. |
| POST | `/traffic/import/preview` | user | **Stateless parse only, writes nothing** (D5). Returns detected `form_type`, per-field `value`/`source`/`confidence`, `unparsed_lines`, and `warnings`. |

**No email-send endpoint.** A `POST /traffic/forms/{id}/email` "send it for me" convenience
was designed here and then explicitly rejected by the roadmap author (2026-08-03, resolving
Risk R7): ECTLogger never sends the traffic itself, by email or otherwise. Emailing an
addressee is logged the same way every other delivery method is — as a `traffic_log.py`
entry with `method = RelayMethod.EMAIL` — after the operator sends it themselves through
their own email client.

### 3.5 Integration into existing surfaces (no new endpoints)

- **ICS-309.** `routers/nets_export.py::export_net_ics309` and `email/net_logs.py::send_ics309_log`
  gain traffic rows built from `traffic_log_entries` where `net_id` matches: one line per hop,
  `FROM` = handling station, `TO` = `handed_to` or `NET`, message =
  `"Radiogram NR 21 R for PORTLAND ME — relayed to Pine Tree Net"`. **Body text is never
  included** (D3).
- **Statistics.** `statistics_user.py`, `statistics_net.py`, and `statistics_global.py` gain a
  `traffic_handled` count rather than getting new endpoints, and a `traffic` drill-down type
  on the existing `DrillDownTable` contract. Counted as: distinct forms where the user has any
  `traffic_log_entries` row, broken out by action so "originated / relayed / delivered" reads
  the way a traffic handler expects.
- **Net log / PDF / close email.** The per-net traffic count and the outstanding count are
  added to the existing net-close summary path, not a new one.

### 3.6 WebSocket

Two new **server-originated** types on the existing per-net socket, following the table in
DEVELOPMENT.md's "WebSocket" section:

| Type | Emitted by | Effect |
|---|---|---|
| `traffic_logged` | `routers/traffic_forms.py` | A form was filed on this net; refetch the panel. |
| `traffic_log_changed` | `routers/traffic_log.py` | A hop was appended; refetch the panel and the badge. |

Both are hints to refetch, not payload carriers — the REST read stays the source of truth,
consistent with the existing convention. DEVELOPMENT.md's WebSocket table and
`.github/copilot-instructions.md`'s type list must both be updated when these ship.

---

## 4. Frontend surface

**Naming hazard, read this first.** `frontend/src/components/forms/` **already exists** and
holds the shared CreateNet/CreateSchedule form panels. The traffic UI must **not** go there.
It goes in `components/traffic/`, and the page is `pages/Traffic.tsx`. "Forms" is the
internal data-model name; **"Traffic" is the user-facing label everywhere in the UI**
(a roadmap requirement).

Read [docs/DESIGN.md](../DESIGN.md) before building any of this: FABs stay `large`, tabs are
`variant="scrollable" scrollButtons={false}` with a swipe handler on the wrapping `<Paper>`,
card footer actions use `<CardActionButton>`, minimum 44 x 44 px touch targets.

### 4.1 Navbar

A single new top-level entry, between Schedule and Stats:

```
{ label: 'Traffic', path: '/traffic', icon: <MailIcon /> }
```

carrying a badge with the caller's inbox count. This is the canonical home — the roadmap's
"single source of truth, not three" requirement means Net, Profile, and (later) Teams get
pre-filtered views that deep-link **into** this section and never reimplement browse/search.

### 4.2 `pages/Traffic.tsx` — the canonical section

The smart page controller: owns tab state, filter state, and permission logic. Tabs:

1. **Browse** — searchable, filterable list of all traffic the caller may see.
2. **Inbox** — pending items the caller holds, oldest first, each with a one-tap
   "Log handoff" action.
3. **New** — form-type picker, then the renderer.
4. **Import** — paste box, then the parse-review screen, then the pre-filled renderer.
5. **Definitions** — admin only.

Deep-link query params drive the pre-filtered entry points: `/traffic?net_id=123`,
`/traffic?held_by_me=1`, `/traffic?id=456`.

### 4.3 `components/traffic/`

| Component | Responsibility |
|---|---|
| `FormRenderer.tsx` | Generic renderer driven entirely by `FormDefinition.fields` (text / textarea / choice / yesno, required, max length, validator, help). A new definition needs **zero** React changes. |
| `RadiogramAssist.tsx` | The radiogram-specific assist layer wrapping the generic renderer: live normalization preview, live check counter, ARL picker entry point, HX code help popover, auto-filled `station_of_origin` / `place_of_origin` / `filed_time`. |
| `ArlMessagePicker.tsx` | Group (Emergency-Welfare / Routine), then number, then blank-filling — a direct port of the reference's `_fill_arl_blanks` flow. |
| `TrafficTable.tsx` | The browse list, built on `useSortableTable`. Columns: number, precedence, type, addressee, disposition chip, held-by, age. |
| `TrafficFilters.tsx` | The filter bar feeding `useTrafficList`. |
| `TrafficDetail.tsx` | Read view: fields, the rendered plaintext, export buttons, the log timeline. |
| `TrafficLogTimeline.tsx` | Append-only chain of custody as a vertical timeline. First-hand vs second-hand entries are visually distinguished. |
| `RelayLogDialog.tsx` | Append a hop: action, method (enum select), path name (free text), handed-to (free text with account autocomplete), occurred-at, note. |
| `TrafficInbox.tsx` | Pending list with age emphasis and the "Log handoff" CTA. |
| `ImportPreview.tsx` | The parse-review screen: per-field confidence, warnings (especially the check mismatch), unparsed lines, and a Confirm that hands off to `FormRenderer`. Paste or drag-and-drop a text file onto the same box (2026-08-03) — both populate the same `text` state; there is no separate upload path. |
| `TrafficPanel.tsx` | The embeddable per-net panel. Reused verbatim by NetView. |
| `print/RadiogramPrintView.tsx`, `print/ICS213PrintView.tsx`, `print/ICS309PrintView.tsx` | Form-accurate print layouts (real box/rule grids matching the ARRL Radiogram pad and FEMA ICS-213/309 forms), added 2026-08-03. See section 4.6. |

### 4.4 `hooks/`

| Hook | Responsibility |
|---|---|
| `useTrafficList.ts` | List + filters + pagination, built on `useApiData`. |
| `useTrafficInbox.ts` | Inbox count for the navbar badge. |
| `useFormDefinitions.ts` | Fetch-once, cached definition list; feeds both the picker and the renderer. |
| `useNtsAssist.ts` | Client-side live normalize + check preview. **Preview only** — the server recomputes on submit. See Risk R1. |

### 4.5 Integrations into existing pages

- **NetView** — a new Traffic side panel registered in `NetViewSidePanels.tsx`, the same
  pattern as the embedded Chat panel, rendering `TrafficPanel.tsx` scoped to `net_id`, with a
  "View all in Traffic" deep-link. Shown only when `net.traffic_enabled`. No browse/search UI
  here.
- **Admin** — `components/admin/AdminTrafficTab.tsx`, modeled closely on `AdminFieldsTab.tsx`:
  enable/disable definitions, reorder, override labels, and set the instance reminder switches.
- **Statistics / NetStatistics / Profile Activity** — "Traffic Handled" and "Traffic Pending"
  tiles on the existing Profile **Activity** tab, each with its own `DrillDownTable` drill-down
  (deep-linking each row to `/traffic?id={form_id}`). **Revision (2026-08-03):** a separate
  Profile "My Traffic" tab (`components/profile/TrafficTab.tsx`) shipped in Phase 6 and was then
  removed — with a full Traffic section carrying its own Inbox tab and a "mine" filter, a second
  standalone inbox view in Profile was redundant. "Traffic Pending" reuses the existing
  `GET /traffic/inbox` data (via `useTrafficInbox()`) rather than adding a parallel
  `traffic_pending`/`traffic_pending_list` stat on the backend, since the inbox query already
  *is* "pending traffic held by this user" (section 2.5) — a second server-side computation of
  the same set would be exactly the kind of duplication D2/R1 already argue against elsewhere in
  this design.

### 4.6 `utils/` and `services/`

- `utils/ntsText.ts` — the TypeScript port of `normalize_nts_text` and `count_nts_check`,
  used only for the live preview.
- `services/api.ts` — a `trafficApi` method group for every endpoint in section 3.

**Revision (2026-08-03) — form-accurate PDF export.** The originally planned `utils/trafficPdf.ts`
(a shared printable-export helper, implying a backend-rendered PDF per section 3.4) never
shipped in that shape. Instead, once the reportlab monospace text dump turned out to look
nothing like a real radiogram or ICS-213 pad, PDF export moved entirely client-side:

- `components/traffic/print/RadiogramPrintView.tsx` and `ICS213PrintView.tsx` are pixel-accurate
  replicas of the real ARRL Radiogram pad and FEMA ICS-213 form (box grids, rules, and all),
  built from the same `field_values`/promoted columns `TrafficDetail.tsx` already has. Delivery
  -confirmation and signature blocks the operator doesn't fill electronically (the radiogram's
  "THIS RADIO MESSAGE WAS RECEIVED AT"/REC'D-SENT strip; ICS-213 blocks 8-10, Approved
  by/Reply/Replied by) print blank and ruled, exactly as they'd appear on a hand-filled paper
  copy, rather than being invented or omitted.
- `components/traffic/print/ICS309PrintView.tsx` is the equivalent replica of FEMA's ICS-309
  Communications Log, fed by a new `?format=json` option on `GET /nets/{id}/export/ics309`
  (`Ics309LogResponse` in `schemas.py`) that returns the exact same header info and log rows the
  CSV already wrote — both formats now come from one shared builder,
  `nets_export.py::_build_ics309_data()`, so they can never diverge. This view is used both by a
  standalone "ICS-309 PDF" button on NetView (beside the existing CSV download) and inside the
  full NetReport PDF, replacing that page's own rough approximation — one accurate rendering,
  not two.
- All three views are captured with the same `html2canvas` + `jsPDF` pipeline every other PDF
  export in the app already uses (`utils/pdfExport.ts`'s `exportElementToPdf`), mounted
  off-screen (not `display:none` — `html2canvas` needs the element laid out) rather than shown
  in the UI, matching the app's existing per-type bespoke-component pattern (`RadiogramAssist.tsx`
  already exists alongside the generic `FormRenderer`).
- The backend PDF branch of `traffic_export.py::export_form` (and its `reportlab` dependency)
  was removed as dead code once nothing called it any more.

---

## 5. RESOLVED — question mark is QUERY, not INT

**Formerly a blocker; closed 2026-08-03.** The two sources disagreed:

- `http://www.ws1sm.com/Message-Handling.html` (Wireless Society of Southern Maine) states a
  question mark is sent as the prosign **QUERY**.
- `bpq-apps`'s `normalize_nts_text` — reviewed and approved by ARRL Digital Section Manager
  Jim KY2D — substitutes **INT** (`apps/forms.py` line 1358).

**The roadmap author (KC1JMH), WSSM club secretary and Cumberland County ARES EC, confirmed
QUERY is correct.** `backend/app/traffic/nts_text.py`'s `NTS_SUBSTITUTIONS` table and
`backend/tests/test_nts_text.py`'s pinned vectors have been updated accordingly; the
`bpq-apps` reference itself is the outlier here and is not being changed (it isn't ours to
change), only ECTLogger's port of it.

**Why this was easy to fix once answered.** The substitution table was designed as one
editable structure, not logic spread through a function, specifically so this answer would
be a one-line change plus its test vector rather than a hunt through the codebase:

```python
NTS_SUBSTITUTIONS = (
    (r'(\d)[.:/](\d)', r'\1R\2',  "decimal / fraction / time colon between digits -> R"),
    (r"'",             '',        "apostrophe dropped"),
    (r'&',             ' AND ',   "ampersand -> AND"),
    (r'@',             ' AT ',    "at-sign -> AT"),
    (r'\?',            ' QUERY ', "question mark -> QUERY"),
    (r'[()]',          ' ',       "parentheses dropped"),
    (r'(\w)\s*-\s*(\w)', r'\1 X \2', "hyphen between words -> X"),
    (r'-',             ' ',       "remaining hyphens -> space"),
    (r'[.,!;:]',       ' X ',     "period, comma, exclamation, semicolon, colon -> X"),
)
```

No further gate on Stage B's production deploy for this item.

### 5.1 Second, smaller discrepancy found in the reference itself — resolve during the port

While reading `apps/forms.py` for this design, a genuine inconsistency surfaced **inside the
reference implementation**, and the port must not replicate it:

- `fill_form` (line 530-539) normalizes **first**, then counts the normalized text:
  `normalized = normalize_nts_text(value)` then `check = count_nts_check(normalized)`, with
  the comment "normalize first, then count (so X prowords are included)".
- `format_nts_radiogram`'s fallback path (line 1486) counts the **raw** text:
  `check = str(self.count_nts_check(raw_text))`, with a comment claiming the pre-computed
  value "counts original words, not prosign substitutions" — which is the opposite of what
  `fill_form` actually does.

These two paths produce different checks for any text containing punctuation. The `fill_form`
order is the one that actually runs in normal use and the one whose comment matches ARRL
practice (the X prowords are transmitted words and are counted). **Port the `fill_form`
order — normalize, then count — and treat the `format_nts_radiogram` fallback as a bug in the
reference that must not be carried over.** Pin this with an explicit test vector.

### 5.2 Also worth a human check before Stage B

`apps/forms/arl_messages.json` contains 87 entries across the `emergency` and `routine`
groups, while the UI text in the reference describes ARL 1-40 and 46-94 (a 89-number span
with gaps). Cross-reference the file against ARRL's canonical `Numbered_Radiograms_FSD_3.pdf`
for completeness and current wording before shipping the picker. This is a data check, not a
design decision, and is Haiku-sized once someone has the PDF in hand.

---

## 6. Phased build plan

Sequencing follows the roadmap's stated order: data model and Traffic menu first, then on-net
entry and email delivery, then the inbox/reminder loop and the stats rollup. Model
assignments follow the roadmap's Model line for this item: Opus resolved the design (this
document); Sonnet implements each phase; Haiku takes the two pure-function ports once specced.

Every phase ends with the DEVELOPMENT.md checks green: `pytest`, `npm run typecheck`,
`npm run lint`, `npm run build`.

### Stage A — Data model and Traffic section

**Phase 1 — Schema and definitions (Sonnet)**

1. Add `FormDisposition`, `TrafficAction`, `RelayMethod` enums and the `FormDefinition`,
   `FormDefinitionField`, `Form`, `TrafficLogEntry` models to `models.py` exactly as
   specified in section 2. Add `Net.forms` (no cascade) and the two composite indexes.
2. Write `052_add_traffic_tables.py` using the DEVELOPMENT.md migration template.
3. Port `radiogram.frm` and `ics213.frm` into `app/traffic/definitions/*.json` (structure
   unchanged) plus `manifest.json` and `arl_messages.json`.
4. Write `app/traffic/definitions.py`: idempotent startup upsert keyed on `form_type`,
   preserving admin overrides of `label`/`description`/`is_enabled`/`sort_order` across
   version bumps. Call it from the existing startup path in `main.py`.
5. Write `app/traffic/log.py`: `append_entry()` (the **single writer** of `held_by_user_id`,
   `held_since`, `last_action`), `derive_disposition()`, and `recompute_form_cache()`.
6. Add `check_form_permission(db, form, user, level)` to `app/permissions.py` per D3.
7. Pydantic schemas in `schemas.py` for definition, form, and log-entry request/response.
8. Tests: definition upsert idempotency, upsert preserves admin overrides, permission matrix
   (all five grant paths plus the denials), `recompute_form_cache` reproduces the cached
   fields from the log for every disposition transition.

**Phase 2 — NTS text engine (Haiku for 2a, Sonnet for 2b)**

- 2a **(Haiku)** — `app/traffic/nts_text.py`: port `normalize_nts_text` and `count_nts_check`
  verbatim from `apps/forms.py`, with the substitution table extracted as `NTS_SUBSTITUTIONS`
  per section 5. Also port `encode_nts_email`, `format_nts_phone`, `_sanitize_nts_address`,
  `_format_text_5words` unchanged. Write `tests/test_nts_text.py` with roughly twenty pinned
  vectors, **including** the question-mark case and the section 5.1 normalize-then-count
  ordering. This is a straight port with a spec: no design latitude, no "improvements".
- 2b **(Sonnet)** — `app/traffic/radiogram.py`: `format_nts_radiogram` (preamble build,
  address block, exactly two `BT` breaks, 5-word body grouping) and `parse_nts_radiogram`
  (the D5 tolerant parser). `app/traffic/ics213.py` for the second type.
  `app/traffic/formatters.py` as the `output_format` registry — the only place in the backend
  that branches on form type.

**Phase 3 — Traffic section skeleton (Sonnet)**

1. `routers/traffic.py` facade plus `traffic_definitions.py` and `traffic_forms.py` (create,
   list, get, patch, delete). Register in `main.py`.
2. `services/api.ts` `trafficApi` group.
3. `pages/Traffic.tsx` with Browse and New tabs, `FormRenderer.tsx`, `TrafficTable.tsx`,
   `TrafficFilters.tsx`, `TrafficDetail.tsx`, `useTrafficList.ts`, `useFormDefinitions.ts`.
4. Navbar entry between Schedule and Stats.
5. Tests: create-then-read round trip, list visibility scoping is in the WHERE clause (assert
   the pagination total does not leak), `PATCH` returns 409 once a log entry exists.

### Stage B — On-net entry and email delivery

Section 5's blocker is resolved (QUERY confirmed); no remaining gate on production deploy.
`GET /traffic/nets/{net_id}/forms` already shipped in Stage A's Phase 3 — Phase 5 task 3
below is done, listed only for sequencing context.

**Phase 4 — Assisted radiogram entry (Sonnet, with Haiku for 4a)**

- 4a **(Haiku)** — `utils/ntsText.ts`: the TypeScript port of `normalize_nts_text` and
  `count_nts_check`, driven by the **same** pinned vectors as Phase 2a (exported to a shared
  JSON fixture consumed by both pytest and the frontend test run). Straight port, specced.
- 4b **(Sonnet)** — `RadiogramAssist.tsx`, `ArlMessagePicker.tsx`, `useNtsAssist.ts`:
  live normalization preview, live check counter, HX help popover, auto-filled
  `station_of_origin` / `place_of_origin` / `filed_time`, ARL picker with blank filling.
- 4c **(Sonnet)** — `GET /traffic/arl-messages` and `app/traffic/arl.py`.

**Phase 5 — Per-net entry and export (Sonnet)**

1. `nets.traffic_enabled` and the two `net_templates` columns, migration `054_`.
2. `TrafficPanel.tsx` and the NetView side-panel registration, matching the Chat panel pattern.
3. ~~`GET /traffic/nets/{net_id}/forms` and `/summary`~~ — the forms list endpoint already
   shipped in Stage A Phase 3; only `/summary` (counts by disposition plus the outstanding/
   stale count for the manager badge) is new here.
4. `traffic_export.py`: plaintext export and PDF export.
5. WebSocket `traffic_logged`; update the DEVELOPMENT.md table and the copilot-instructions
   type list.

**No email-send task.** The "send it for me" endpoint originally planned here was rejected
by the roadmap author (Risk R7, resolved) — see section 3.4. Emailing an addressee is logged
via the ordinary relay/delivery log (`RelayMethod.EMAIL`, Phase 6) after the operator sends it
themselves; nothing in this phase sends anything.

### Stage C — Inbox, reminder loop, and stats rollup

**Phase 6 — Relay/delivery log and inbox (Sonnet)**

1. `traffic_log.py` router: append, list, admin delete-last, `GET /traffic/inbox`.
2. `TrafficLogTimeline.tsx`, `RelayLogDialog.tsx`, `TrafficInbox.tsx`, `useTrafficInbox.ts`,
   navbar badge.
3. ~~`components/profile/TrafficTab.tsx` ("My Traffic")~~ — shipped here, then removed
   2026-08-03 in favor of a "Traffic Pending" tile on Profile's Activity tab (see section 4.5).
4. WebSocket `traffic_log_changed`.
5. Tests: full chain across all six actions with the derived disposition asserted at each
   step; inbox membership transitions (RECEIVED in, RELAYED-to-known moves, RELAYED-to-unknown
   clears, DELIVERED clears); admin can delete only the last entry.

**Phase 7 — Reminder service (Sonnet)**

1. `traffic_reminder_logs` table and `users.notify_traffic_reminder`, migration `053_`.
2. `app/traffic_reminder_service.py` following `ncs_reminder_service.py`: background loop,
   the precedence ladder from D4, **one-sided** windows reusing the `_in_reminder_window`
   shape, HXB override, stale marking, and the opt-in weekly manager digest.
3. Email templates in `app/email/` (a new `traffic.py` module, surfaced through the
   `EmailService` facade). The reminder links straight to the log-entry dialog for that form,
   not to a yes/no.
4. `app_settings.traffic_reminder_enabled` and the AppSettings plumbing.
5. Tests: the ladder fires at the right elapsed times for each precedence and **never early**;
   the unique constraint blocks a duplicate send; a new log entry removes the form from
   eligibility; HXB overrides the ladder.

**Phase 8 — Import (Sonnet)**

1. `POST /traffic/import/preview` wired to `parse_nts_radiogram` / ICS-213 parsing.
2. `ImportPreview.tsx` and the Import tab: per-field confidence, warnings, unparsed lines,
   confirm-into-renderer.
3. Tests: clean text round-trips through format then parse with zero loss; missing `BT`
   still yields a usable partial parse; reflowed lines parse identically; a check mismatch
   produces a warning and preserves both values; unknown input never 500s.

**Phase 9 — Stats rollup and ICS-309 integration (Sonnet)**

1. `traffic_handled` counts in `statistics_user.py`, `statistics_net.py`,
   `statistics_global.py`, broken out by action; `traffic` drill-down on `DrillDownTable`.
2. Traffic rows in `export_net_ics309` and `send_ics309_log`, **metadata only, never body**.
3. Net-close email and PDF report summary lines.
4. Admin tab `AdminTrafficTab.tsx`.
5. Docs: `README.md` feature list, `docs/USER-GUIDE.md` operator walkthrough,
   `docs/CHANGELOG.md` plus `frontend/src/changelog.json`, DEVELOPMENT.md WebSocket table and
   project-structure tree, and removal of the roadmap section per the pruning policy.

---

## 7. Risks and tradeoffs

Scrutinize these before implementation starts.

**R1 — The NTS text engine exists twice (Python and TypeScript) and will drift.**
The live check counter is the feature's headline UX, so it must run client-side; the check
that goes on the air must be authoritative, so it must run server-side. Two implementations
is the honest cost. Mitigations: the server always recomputes and ignores any client-supplied
check, so drift causes a cosmetic surprise rather than a wrong radiogram; and both
implementations are pinned to a **single shared JSON fixture of test vectors** consumed by
both `pytest` and the frontend test run, so a drift is a red test, not a field report. Do not
let the TS port acquire "improvements" the Python one lacks.

**R2 — Three cached columns on `Form` (`held_by_user_id`, `held_since`, `last_action`) are a
denormalization of the log.**
This is the deliberate price of keeping the inbox and every list view a single-table indexed
query instead of a correlated subquery over the log. The safety properties are: exactly one
writer (`app/traffic/log.py::append_entry`, updating in the same transaction as the insert),
a `recompute_form_cache()` rebuild helper, and a test that asserts the rebuild reproduces the
cache for every disposition transition. **Reviewer question:** is one-writer discipline
enough, or should `recompute_form_cache` also run as a periodic consistency sweep in the
reminder service? Cheap to add, and it would make a bug self-healing rather than persistent.

**R3 — Disposition being derived, not stored, means the log is load-bearing for correctness.**
A missing log entry does not look like a missing log entry; it looks like a message that was
never delivered, and the operator gets reminder emails about traffic they already passed. The
mitigation is UX, not schema: after any action that plausibly means a handoff, the UI must
make "log the handoff" the obvious next tap, and the reminder email must link straight to the
log dialog. Worth a usability check with a real traffic handler on beta before Stage C ships.

**R4 — Cross-net visibility.**
A message received on net A and relayed on net B is visible to both nets' managers, because
`net_id` on the form points at one net while log entries point at others. That is correct for
HXD reporting, and it means net B's NCS can see a message that originated on someone else's
net. The alternative — scoping visibility to the specific net where each log entry happened —
is more precise but turns every list query into a per-row permission evaluation. **Reviewer
decision needed:** confirm the simpler, broader rule is acceptable. It is the one place in
D3 where we chose queryability over minimum disclosure.

**R5 — This is the most sensitive data ECTLogger has ever stored.**
Welfare traffic carries a private individual's name, street address, telephone number, and
email — a person who is not a user, never consented, and cannot delete their own record. The
Teams design notes classify street addresses as high sensitivity; this is the same class,
arriving earlier. Open items a reviewer must close: retention policy for delivered traffic;
what happens to a form when its submitter deletes their account (anonymize the handler, keep
the record?); whether `field_values` warrants encryption at rest ahead of the broader
Teams-driven decision; and whether the plaintext export needs any access logging. The
body-never-on-ICS-309 rule (D3) is a start, not an answer.

**R6 — Builtin-only definitions mean a new form type waits for a release.**
An operator who needs ICS-213RR cannot add it from the Admin panel. Accepted, because the
alternative risks an admin editing the radiogram into invalid NTS traffic (D1). The escape
hatch is `output_format = 'generic'` admin-authored definitions in a later phase, which no
formatter is coupled to and which therefore cannot produce a wrong radiogram. Revisit only if
real demand appears.

**R7 — RESOLVED (2026-08-03): no ECTLogger-sent email, ever.**
The roadmap's Stage B said "on-net entry and email delivery", and a "send it for me"
convenience endpoint was designed and then put to the roadmap author, since an
ECTLogger-sent email was the closest this feature came to being a transport — a direct
conflict with the positioning constraint. The author rejected it outright. Emailing an
addressee is logged the same way every other delivery method is: the operator sends it
themselves through their own email client, then records it via the ordinary relay/delivery
log with `method = RelayMethod.EMAIL`. No `app_settings.traffic_email_delivery_enabled`
column, no email-sending endpoint, no `app/email/traffic.py` module for this purpose.

**R8 — `components/forms/` already exists and means something else.**
It is the shared CreateNet/CreateSchedule panel directory. Traffic UI goes in
`components/traffic/`. Flagged here because an implementation agent reading "Forms data model"
in the roadmap will reach for `components/forms/` by reflex and quietly create a mess.

**R9 — Reminder logs are written on instances where email is disabled.**
Beta and alpha run `EMAIL_ENABLED=false`, so sends are logged no-ops — but the
`traffic_reminder_logs` row is still written, meaning a beta instance silently consumes its
reminder stages and later cannot re-send them for testing. Either write the log row only on a
real send, or provide a test-only reset. Decide in Phase 7; the second option is safer,
because writing the row only on success reintroduces the duplicate-send race that the unique
constraint exists to prevent.

**R10 — The `traffic_log_entries.sequence` assignment is a read-then-write race.**
Two operators appending a hop to the same form concurrently could both compute the same next
sequence. The `UniqueConstraint(form_id, sequence)` turns that into an `IntegrityError`
rather than a corrupted chain, but `append_entry` must catch it and retry once rather than
surfacing a 500. Small, but it will happen on a busy net with an NCS and a logger both
working the same message.

---

## 8. Open questions for the human

**Resolved (2026-08-03):**

1. ~~QUERY or INT for a question mark?~~ **QUERY**, confirmed by the roadmap author. Section 5.
2. ~~Is the broader cross-net visibility rule acceptable?~~ **Yes**, accepted as designed. R4.
3. ~~Retention/anonymization/encryption posture for addressee PII?~~ **Ship v1 as plain
   JSON-in-Text storage**, matching `CheckIn.custom_fields`; revisit as a separate roadmap
   item later, not a Stage A/B blocker. R5.
4. ~~Is "email the addressee" the right reading of "email delivery," or should the endpoint
   be dropped?~~ **Dropped entirely.** No ECTLogger-sent email of any kind. R7.

**Still open:**

1. Should the default reminder ladder (24 h / 72 h / 7 d for routine) be instance-configurable
   in `app_settings`, or is a fixed ladder with per-precedence scaling sufficient for v1?
2. Does `arl_messages.json` (87 entries) match ARRL's current `Numbered_Radiograms_FSD_3.pdf`
   in both coverage and wording? (section 5.2)
3. Where does Traffic sit in the navbar once Teams ships — the Teams notes call for Teams
   between Schedule and Stats, and this document places Traffic there too.

---

## 9. Reference links

- `bpq-apps` repo: `apps/forms.py`, `apps/forms/radiogram.frm`, `apps/forms/ics213.frm`,
  `apps/forms/arl_messages.json`, `apps/forms/manifest.json`
- http://www.ws1sm.com/Message-Handling.html
- http://www.ws1sm.com/The-Radiogram.html
- http://www.ws1sm.com/Forms/ARRL_Radiogram_Fillable.pdf
- http://www.ws1sm.com/Forms/ICS-213.pdf
- http://www.ws1sm.com/Forms/ICS-213RR.pdf (candidate third form type)
- http://www.ws1sm.com/Forms/Numbered_Radiograms_FSD_3.pdf
- https://vden.org/pktnet/ (additional packet form formats, not yet reviewed for ECTLogger)
