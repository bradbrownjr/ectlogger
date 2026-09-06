// ========== NAME FIELD PII GUARD ==========
// A Name field is meant to hold a first name (or nickname), which is shown
// on the public check-in list, net report, and shareable net link -- all
// viewable by anyone, including guests with no account. Typing an email
// address in there (seen on the ME Dirigo Net, 2026-09-06 -- an admin had
// to overwrite it after the fact, more than once) exposes real PII to
// everyone who can see the net. This is a soft nudge, not a hard block:
// some legitimate names could coincidentally look email-shaped, and the
// field isn't validated as a "real name" otherwise either.

const EMAIL_LIKE_PATTERN = /\S+@\S+\.\S+/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_LIKE_PATTERN.test(value.trim());
}

export const NAME_FIELD_EMAIL_WARNING = "That looks like an email address — enter your first name instead so it isn't shown publicly.";
