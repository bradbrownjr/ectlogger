// ========== RRI STRIP TEXT <-> FIELD VALUES ==========
// Both directions of the canonical RRI "RI strip" wire string, so the
// composer can show an operator the exact text that will be filed while they
// type, and can take a strip read back over the air and drop it into the same
// fields.
//
// The layout these work from (keyword + which fields start a new "/ /"
// section) is never guessed here -- it comes from the backend on
// FormDefinitionResponse.strip_keyword / fields[].starts_new_section, which
// app/traffic/rri_strip.py::strip_layout() fills in from the one table that
// also drives format_rri_strip(). Compose below is the TypeScript mirror of
// that formatter, and split is the mirror of parse_rri_strip()'s walk.

export interface StripSlot {
  // Field name for a defined type; the field's own name-as-label for a net's
  // raw origin strip. Only used for grouping, never emitted.
  name: string;
  startsNewSection: boolean;
}

/** Number of "/ /" section boundaries in a layout. */
function sectionBreakCount(slots: StripSlot[]): number {
  return slots.filter((slot, index) => slot.startsNewSection && index > 0).length;
}

/**
 * Build the canonical slash-delimited strip: keyword, then each value in
 * order, with an empty token wherever the layout starts a new section, and
 * "//" as the terminator.
 *
 * uppercase mirrors format_rri_strip(), which upper-cases every value. It is
 * off for a net's raw origin strip, which is stored verbatim as
 * RRI_STRIP_OTHER text rather than re-rendered from fields.
 */
export function composeStripText(
  keyword: string,
  slots: StripSlot[],
  values: string[],
  uppercase = false
): string {
  const parts: string[] = keyword ? [keyword] : [];
  slots.forEach((slot, index) => {
    if (slot.startsNewSection && index > 0) parts.push(' ');
    const value = values[index] ?? '';
    parts.push(uppercase ? value.toUpperCase() : value);
  });
  return `${parts.join('/')}//`;
}

/** Flatten to one line and split on "/", keeping blanks (a blank token is
 *  either an unanswered field or a section boundary -- which one is decided
 *  by the layout, in splitStripText below). */
function rawTokens(text: string): string[] {
  const flat = text.replace(/\s*[\r\n]+\s*/g, '').trim();
  return flat.replace(/\/+$/, '').split('/');
}

export interface SplitStripResult {
  values: string[];
  warnings: string[];
}

/**
 * Map a pasted strip back onto a layout's fields, positionally.
 *
 * Blanks are preserved rather than dropped, so a strip with an unanswered
 * field in the middle ("...//CITY///STATE...") still lands every later value
 * on the right field.
 */
export function splitStripText(text: string, keyword: string, slots: StripSlot[]): SplitStripResult {
  const tokens = rawTokens(text);
  const warnings: string[] = [];
  const values = slots.map(() => '');

  // Decide whether the first token is the keyword or already a value. An
  // exact keyword match settles it; otherwise the token count does, and
  // either way the operator is told what was assumed.
  const expected = slots.length + sectionBreakCount(slots);
  const first = (tokens[0] ?? '').trim().toUpperCase();
  let idx = 0;
  if (keyword && first === keyword.trim().toUpperCase()) {
    idx = 1;
  } else if (tokens.length > expected) {
    idx = 1;
    warnings.push(`Treated "${tokens[0]}" as the strip keyword${keyword ? ` (expected ${keyword})` : ''}.`);
  } else if (keyword) {
    warnings.push(`This strip does not start with ${keyword}; read it as values only.`);
  }

  let filled = 0;
  slots.forEach((slot, index) => {
    // Consume the boundary token of a "/ /" break, but only when it really
    // is blank -- same rule parse_rri_strip() uses.
    if (slot.startsNewSection && index > 0 && (tokens[idx] ?? '').trim() === '' && idx < tokens.length) {
      idx += 1;
    }
    if (idx < tokens.length) {
      values[index] = tokens[idx].trim();
      filled += 1;
    }
    idx += 1;
  });

  if (filled < slots.length) {
    warnings.push(`Only ${filled} of ${slots.length} fields were present -- fill the rest by hand.`);
  }
  const extra = tokens.slice(idx).filter((token) => token.trim());
  if (extra.length > 0) {
    warnings.push(`${extra.length} extra value${extra.length === 1 ? '' : 's'} beyond this strip's fields were ignored.`);
  }
  return { values, warnings };
}
