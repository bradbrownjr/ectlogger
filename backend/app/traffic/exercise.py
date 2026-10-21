"""The exercise marking on drill traffic.

ARES exercise plans require every formal message to state that it is an
exercise at its beginning and end, so a drill message found later can't be
taken for real traffic. The printed forms carry the same words
(frontend traffic/print/ExerciseMarking.tsx).
"""

EXERCISE_MARKING = "THIS IS AN EXERCISE"


def mark_exercise_text(text: str) -> str:
    """Text that starts and ends with the marking. Text that already does
    is returned as it is, so marking twice changes nothing."""
    body = (text or "").strip()
    if body.upper().startswith(EXERCISE_MARKING) and body.upper().endswith(EXERCISE_MARKING):
        return body
    return f"{EXERCISE_MARKING}\n\n{body}\n\n{EXERCISE_MARKING}" if body else EXERCISE_MARKING
