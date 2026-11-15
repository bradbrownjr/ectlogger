"""
ICS-205 radio communications plan: the frequency fields' validators and the
channel plan's save and read rules.

Frequency fields (stored normalized on the shared Frequency row):

  offset     signed MHz, 3 decimals: "-0.6" -> "-0.600", "+5" -> "+5.000".
             The sign is required (a repeater's direction is never guessed);
             0 or blank is simplex and stored as null.
  tones      CTCSS "100.0", DCS "D023", or P25 "NAC 293".
  bandwidth  "N" (narrow) or "W" (wide).

Sources for the tone lists:

  CTCSS  The 42 tones in CISA's National Interoperability Field Operations
         Guide (NIFOG) v1.6.1A, Jan 2019, "CTCSS Tones and Codes" (p. 62),
         which also notes 69.3 Hz is "69.4 in some radios"; plus the 8 tones
         amateur radios add to make the usual 50-tone list (159.8, 165.5,
         171.3, 177.3, 183.5, 189.9, 196.6, 199.5), as listed outside the
         EIA/TIA standard on repeater-builder.com's CTCSS chart
         (https://www.repeater-builder.com/tech-info/ctcss/ctcss-chart.html).
         Icom's 71.0 Hz is on that chart too but in no common list, so it is
         refused.
  DCS    Every code in NIFOG v1.6.1A's "DCS Codes" table (p. 63), normal and
         inverted columns: 104 codes, the list amateur radios offer. The
         table pairs each code with its inverted twin; this module stores the
         code only, with no polarity suffix, since no published source for a
         "D023N" / "D023I" text format was found.
  NAC    A P25 Network Access Code is 12 bits, three hex digits; NIFOG
         v1.6.1A "P25 Digital Codes" (p. 64) writes them "$293" (the default),
         "$F7E" (receiver opens on any NAC) and "$F7F".

Channel plan rules (ChannelPlanEntry):
  * a saved list replaces the net's or schedule's entries, in list order;
  * an entry for a frequency the net or schedule does not use after the
    save is dropped;
  * a response lists only entries for frequencies currently selected;
  * a signed-out viewer gets each entry's frequency and plan_role only, and
    never the special instructions.
"""
from decimal import Decimal, InvalidOperation
import re
from typing import Iterable, List, Optional, Sequence

PLAN_ROLES = ("primary", "alternate", "contingency", "emergency")
ICS_FUNCTIONS = ("command", "tactical", "ground_to_air", "air_to_air", "support", "dispatch")

# NIFOG v1.6.1A p. 62 (42 tones) + the 8 amateur 50-tone additions.
CTCSS_TONES = frozenset({
    "67.0", "69.3", "71.9", "74.4", "77.0", "79.7", "82.5", "85.4", "88.5", "91.5",
    "94.8", "97.4", "100.0", "103.5", "107.2", "110.9", "114.8", "118.8", "123.0", "127.3",
    "131.8", "136.5", "141.3", "146.2", "151.4", "156.7", "159.8", "162.2", "165.5", "167.9",
    "171.3", "173.8", "177.3", "179.9", "183.5", "186.2", "189.9", "192.8", "196.6", "199.5",
    "203.5", "206.5", "210.7", "218.1", "225.7", "229.1", "233.6", "241.8", "250.3", "254.1",
})
# NIFOG: "69.4 in some radios". The same tone; stored as the standard value.
CTCSS_ALIASES = {"69.4": "69.3"}

# NIFOG v1.6.1A p. 63, both columns.
DCS_CODES = frozenset("""
023 025 026 031 032 036 043 047 051 053 054 065 071 072 073 074 114 115 116 122
125 131 132 134 143 145 152 155 156 162 165 172 174 205 212 223 225 226 243 244
245 246 251 252 255 261 263 265 266 271 274 306 311 315 325 331 332 343 346 351
356 364 365 371 411 412 413 423 431 432 445 446 452 454 455 462 464 465 466 503
506 516 523 526 532 546 565 606 612 624 627 631 632 654 662 664 703 712 723 731
732 734 743 754
""".split())

OFFSET_LIMIT_MHZ = Decimal(100)

_CTCSS_RE = re.compile(r"^(?:(?:PL|CTCSS|CTC|TONE|T)\s*)?(\d{2,3}(?:\.\d0?)?)\s*(?:HZ)?$")
_DCS_RE = re.compile(r"^(?:(?:DCS|DPL|DTCS|D)\s*)?(\d{3})$")
_NAC_RE = re.compile(r"^(?:NAC\s*\$?|\$)\s*([0-9A-F]{3})$")


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_offset(value: Optional[str]) -> Optional[str]:
    """"-0.6" -> "-0.600"; blank or zero -> None (simplex). Raises ValueError."""
    text = _clean(value)
    if text is None:
        return None
    # The net view prints offsets with a real minus sign; accept one typed back.
    text = text.replace("−", "-").replace(" ", "")
    if text.upper().endswith("MHZ"):
        text = text[:-3]
    if not re.fullmatch(r"[+-]?\d+(?:\.\d+)?|[+-]?\.\d+", text):
        raise ValueError(
            f"Offset {value!r} isn't a number of MHz. Enter it like -0.600 or +5.000."
        )
    try:
        amount = Decimal(text)
    except InvalidOperation:
        raise ValueError(f"Offset {value!r} isn't a number of MHz. Enter it like -0.600 or +5.000.")
    if amount == 0:
        return None
    if text[0] not in "+-":
        raise ValueError("Give the offset a + or - sign, like -0.600 or +5.000.")
    if abs(amount) > OFFSET_LIMIT_MHZ:
        raise ValueError("Enter the offset in MHz, like -0.600 or +5.000.")
    if amount != amount.quantize(Decimal("0.001")):
        raise ValueError("Enter the offset to the nearest kHz, like -0.600.")
    return f"{amount:+.3f}"


def normalize_tone(value: Optional[str]) -> Optional[str]:
    """A CTCSS tone, DCS code or P25 NAC in its stored form, or None for
    blank. Raises ValueError for anything else.

    A bare number is a CTCSS tone ("100" -> "100.0"), except three digits
    starting with 0, which only a DCS code can be ("023" -> "D023"). Any
    other DCS code needs its D ("D131"), since "131" is easily a mistyped
    131.8 Hz tone.
    """
    text = _clean(value)
    if text is None:
        return None
    upper = re.sub(r"\s+", " ", text.upper())

    nac = _NAC_RE.match(upper)
    if nac:
        return f"NAC {nac.group(1)}"

    dcs = _DCS_RE.match(upper)
    if dcs and (upper[0] == "D" or upper.startswith("0")):
        code = dcs.group(1)
        if code not in DCS_CODES:
            raise ValueError(f"{code} isn't a standard DCS code.")
        return f"D{code}"

    ctcss = _CTCSS_RE.match(upper)
    if ctcss:
        tone = f"{Decimal(ctcss.group(1)):.1f}"
        tone = CTCSS_ALIASES.get(tone, tone)
        if tone in CTCSS_TONES:
            return tone
        if dcs and dcs.group(1) in DCS_CODES:
            raise ValueError(f"{text} isn't a CTCSS tone. For DCS code {dcs.group(1)}, enter D{dcs.group(1)}.")
        raise ValueError(f"{text} Hz isn't a standard CTCSS tone.")

    raise ValueError(
        f"Tone {value!r} isn't recognized. Enter a CTCSS tone like 100.0, "
        "a DCS code like D023, or a P25 NAC like NAC 293."
    )


def normalize_bandwidth(value: Optional[str]) -> Optional[str]:
    """"N"/"narrow" -> "N", "W"/"wide" -> "W", blank -> None."""
    text = _clean(value)
    if text is None:
        return None
    key = text.upper()
    if key in ("N", "NARROW"):
        return "N"
    if key in ("W", "WIDE"):
        return "W"
    raise ValueError("Bandwidth is N (narrow) or W (wide).")


def clean_text(value: Optional[str]) -> Optional[str]:
    """Trimmed text, or None when blank."""
    return _clean(value)


# ---------------------------------------------------------------------------
# Saving and reading a plan
# ---------------------------------------------------------------------------

def check_unique_frequencies(items: Sequence) -> Sequence:
    """A channel appears once on a plan."""
    seen = set()
    for item in items:
        if item.frequency_id in seen:
            raise ValueError("A frequency can appear only once on the channel plan.")
        seen.add(item.frequency_id)
    return items


def apply_channel_plan(owner, items: Optional[Sequence], selected_frequency_ids: Iterable[int]) -> None:
    """Set *owner*'s (a Net or NetTemplate) channel plan.

    *items* is the saved list (ChannelPlanItem schemas), or None to keep the
    current entries. Either way, entries for frequencies outside
    *selected_frequency_ids* are dropped, so changing the frequency list
    alone also prunes the plan.

    Existing rows are updated in place by frequency rather than deleted and
    re-inserted: the unit of work inserts before it deletes, which would trip
    the (owner, frequency) unique constraint.
    """
    from app.models import ChannelPlanEntry

    selected = set(selected_frequency_ids)
    existing = {entry.frequency_id: entry for entry in owner.channel_plan_entries}
    if items is None:
        kept = [e for e in owner.channel_plan_entries if e.frequency_id in selected]
        for position, entry in enumerate(kept):
            entry.position = position
        owner.channel_plan_entries = kept
        return

    entries = []
    for item in items:
        if item.frequency_id not in selected:
            continue
        entry = existing.get(item.frequency_id) or ChannelPlanEntry(frequency_id=item.frequency_id)
        entry.position = len(entries)
        entry.plan_role = item.plan_role
        entry.ics_function = item.ics_function
        entry.assignment = item.assignment
        entry.remarks = item.remarks
        entries.append(entry)
    owner.channel_plan_entries = entries


def copy_channel_plan(source) -> List:
    """New, unsaved entries copying *source*'s plan (a schedule's, for a net
    made from it). The source's saves already limit it to its frequencies,
    and a response shows only lines for the net's own (channel_plan_response)."""
    from app.models import ChannelPlanEntry

    copies = []
    for entry in sorted(source.channel_plan_entries, key=lambda e: e.position):
        copies.append(ChannelPlanEntry(
            frequency_id=entry.frequency_id,
            position=len(copies),
            plan_role=entry.plan_role,
            ics_function=entry.ics_function,
            assignment=entry.assignment,
            remarks=entry.remarks,
        ))
    return copies


def channel_plan_response(owner, frequencies, signed_in: bool) -> List[dict]:
    """The plan as the API returns it: entries for the frequencies currently
    on *owner*, in position order. A signed-out viewer gets frequency_id and
    plan_role only; ICS function, assignment and remarks can name staff,
    sites and agencies."""
    selected = {f.id for f in frequencies}
    plan = []
    for entry in sorted(owner.channel_plan_entries, key=lambda e: e.position):
        if entry.frequency_id not in selected:
            continue
        plan.append({
            "frequency_id": entry.frequency_id,
            "plan_role": entry.plan_role,
            "ics_function": entry.ics_function if signed_in else None,
            "assignment": entry.assignment if signed_in else None,
            "remarks": entry.remarks if signed_in else None,
        })
    return plan
