// ========== NAME FIELD PII GUARD ==========
// A Name field is meant to hold a first name (or nickname), which is shown
// on the public check-in list, net report, and shareable net link -- all
// viewable by anyone, including guests with no account. Typing an email
// address in there (seen on the ME Dirigo Net, 2026-09-06 -- an admin had
// to overwrite it after the fact, more than once) exposes real PII to
// everyone who can see the net. A link is a related problem, not just a
// privacy one: it's spammy in a field meant for a first name, and a long
// URL widens the callsign column enough to force NCS to horizontally
// scroll the check-in list (seen on account NB9D). This is a soft nudge on
// the check-in Name field -- some legitimate names could coincidentally
// look email- or URL-shaped, and the field isn't validated as a "real
// name" otherwise either. The account-level Name field (ProfileSetupDialog)
// escalates this to a hard block -- see that component.

const EMAIL_LIKE_PATTERN = /\S+@\S+\.\S+/;
const URL_LIKE_PATTERN = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(com|net|org|us|io|tv|me|co|gov|edu|info|biz)(\/\S*)?\b)/i;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_LIKE_PATTERN.test(value.trim());
}

export function looksLikeUrl(value: string): boolean {
  return URL_LIKE_PATTERN.test(value.trim());
}

export function looksLikeEmailOrUrl(value: string): boolean {
  return looksLikeEmail(value) || looksLikeUrl(value);
}

export const NAME_FIELD_EMAIL_WARNING = "That looks like an email address or a link — enter your first name instead so it isn't shown publicly.";
