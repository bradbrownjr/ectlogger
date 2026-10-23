"""
Every action the server logs has a name in Admin > Activity.

The wording lives in frontend/src/utils/activityLog.ts; an action missing
from it shows as its raw code (e.g. "net.auto_archived"). This reads the
action names straight out of the backend source, so adding a
record_event(...) call without a label fails here.
"""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
LABELS = BACKEND.parent / "frontend" / "src" / "utils" / "activityLog.ts"

# Literal actions passed to record_event / record_net_event /
# record_schedule_event, including the two picked by a conditional.
ACTION = re.compile(r'"((?:auth|user|net|schedule|check_in|chat|off_net_log|admin|frequency|contact|backup)\.[a-z_]+)"')
CALL = re.compile(r"record_(?:net_|schedule_)?event\(\s*db,\s*(.+?),", re.S)


def _logged_actions() -> set:
    actions = set()
    for path in (BACKEND / "app").rglob("*.py"):
        for call in CALL.finditer(path.read_text()):
            actions.update(ACTION.findall(call.group(1)))
    return actions


def test_every_logged_action_has_a_label():
    labels = set(re.findall(r"^\s*'([a-z_]+\.[a-z_]+)':", LABELS.read_text(), re.M))
    logged = _logged_actions()
    assert len(logged) > 50  # the scan itself still finds them
    assert logged - labels == set()
