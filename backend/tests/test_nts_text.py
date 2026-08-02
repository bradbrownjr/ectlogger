"""
Pinned test vectors for the ARRL NTS text normalization/count port.

Each normalization vector was derived by tracing app/traffic/nts_text.py's
normalize_nts_text by hand against bpq-apps apps/forms.py::normalize_nts_text
(the ARRL-approved reference), rule by rule. If normalize_nts_text's behavior
ever changes, these vectors should change with it deliberately, not silently.
"""
import pytest

from app.traffic.nts_text import (
    normalize_nts_text,
    count_nts_check,
    normalize_and_count,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        # Terminal punctuation is stripped outright, not turned into a prosign.
        ("This is a test.", "THIS IS A TEST"),
        # Comma, exclamation, semicolon, colon mid-sentence -> X word group each.
        ("Wow! Great, right; okay: sure", "WOW X GREAT X RIGHT X OKAY X SURE"),
        # Decimal point between digits -> R (146.52 -> 146R52), not X.
        ("The freq is 146.52 tonight", "THE FREQ IS 146R52 TONIGHT"),
        # Colon between digits (time-like) is also the digit-separator rule, not
        # the generic colon-terminal rule, since it sits between two digits.
        ("Meet at 14:30 hours", "MEET AT 14R30 HOURS"),
        # Fraction slash between digits -> R, same digit-separator rule.
        ("Fractions like 1/2 cup", "FRACTIONS LIKE 1R2 CUP"),
        # Ampersand -> AND (with surrounding spaces).
        ("Mom & Dad are fine", "MOM AND DAD ARE FINE"),
        # At-sign -> AT; the literal "." in an email address still hits the
        # terminal/generic period rule (there's no digit on either side), so
        # it becomes X, not DOT (DOT is only used by encode_nts_email).
        ("Contact me at foo@example.com please", "CONTACT ME AT FOO AT EXAMPLE X COM PLEASE"),
        # Parentheses are dropped (replaced with a space), not spelled out.
        ("Well (maybe) not", "WELL MAYBE NOT"),
        # Hyphen directly between two word characters -> " X " (counted prosign).
        ("Well-known station", "WELL X KNOWN STATION"),
        # Hyphen surrounded by spaces still has a word character on each side
        # once the surrounding whitespace is skipped, so the word-hyphen-word
        # rule (which allows \s* around the hyphen) still fires -> X, not a
        # plain space. Only a hyphen with no word character on one side (e.g.
        # a bare leading/trailing dash) falls through to the plain-space rule.
        ("Free - standing pole", "FREE X STANDING POLE"),
        # Apostrophe is simply dropped, no space introduced.
        ("Don't stop believing", "DONT STOP BELIEVING"),
        # A hash mark is untouched by normalize_nts_text (only _sanitize_nts_address
        # spells out # -> NR); it survives normalization as a literal character.
        ("Rock-n-roll station #5, right?", "ROCK X N ROLL STATION #5 X RIGHT"),
        # Trailing hyphen is stripped as trailing punctuation before any
        # substitution runs (leading regex strips [.,!?;:\s]+ at end of string).
        ("Ends with dash-", "ENDS WITH DASH"),
        # Trailing question mark is stripped the same way, before the ? -> INT
        # substitution ever sees it, so no trailing INT prosign remains either.
        ("Ends with question?", "ENDS WITH QUESTION"),
        # Multiple internal spaces collapse to one.
        ("Multiple   spaces   here", "MULTIPLE SPACES HERE"),
        # Pure-digit strings are left as one token by normalize_nts_text (word
        # splitting into 5-digit groups is count_nts_check's job, not this one's).
        ("12345 units delivered", "12345 UNITS DELIVERED"),
        # The question-mark case. Currently substitutes to " INT " per the
        # ARRL-approved bpq-apps reference. THIS IS UNCONFIRMED — see
        # docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5. If a human
        # NTS/RRI authority confirms QUERY instead, update NTS_SUBSTITUTIONS
        # and this vector together.
        ("Is this a test?", "IS THIS A TEST"),
        # Mid-sentence question mark (not stripped as trailing) does produce
        # the INT prosign.
        ("What time is it? Reply soon", "WHAT TIME IS IT INT REPLY SOON"),
        # Combination vector: colon-terminal, decimal-digit, ampersand,
        # parentheses, standalone hyphen, comma, and mid-sentence question
        # mark all in one string.
        (
            "Combo: cost is 12.5 & (extra) - stuff, right?",
            "COMBO X COST IS 12R5 AND EXTRA X STUFF X RIGHT",
        ),
    ],
)
def test_normalize_nts_text_pinned_vectors(raw, expected):
    assert normalize_nts_text(raw) == expected


def test_count_nts_check_counts_x_and_int_prowords_in_normalized_text():
    # "WOW X GREAT X RIGHT" is 5 words once normalized (X counts as a word
    # each time it appears), matching manual word-counting.
    normalized = normalize_nts_text("Wow! Great, right.")
    assert normalized == "WOW X GREAT X RIGHT"
    assert count_nts_check(normalized) == 5


def test_count_nts_check_groups_long_digit_runs_by_five():
    # A run of 6 digits counts as ceil(6/5) = 2 words; 5 or fewer is 1 word.
    assert count_nts_check("12345") == 1
    assert count_nts_check("123456") == 2


def test_normalize_and_count_uses_normalized_text_not_raw_text():
    """Prove the port does NOT reproduce format_nts_radiogram's fallback bug.

    bpq-apps's format_nts_radiogram fallback path counts the RAW text
    (count_nts_check(raw_text)) when no pre-computed check is available,
    which disagrees with fill_form's normalize-then-count order and is
    documented as a reference bug in
    docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 5.1. Punctuation like
    "!" and "," becomes an X proword only after normalization, so counting
    raw vs. normalized text gives different totals for the same string.
    """
    raw = "Wow! Great, right."

    raw_count = count_nts_check(raw)
    normalized_count = count_nts_check(normalize_nts_text(raw))

    # The two orders genuinely disagree for this string.
    assert raw_count == 3
    assert normalized_count == 5
    assert raw_count != normalized_count

    # normalize_and_count must side with fill_form's order (normalized),
    # never with format_nts_radiogram's fallback order (raw).
    normalized_text, check = normalize_and_count(raw)
    assert normalized_text == "WOW X GREAT X RIGHT"
    assert check == normalized_count
    assert check != raw_count
