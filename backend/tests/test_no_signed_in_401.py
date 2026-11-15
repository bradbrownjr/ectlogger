"""Only sign-in answers 401.

The app reads any 401 to a request that carried a token as "your session has
expired" and signs the user out (frontend/src/services/api.ts). Until
2026-11-15, a wrong current password or two-factor code on a signed-in screen
(Set password, two-factor setup, replace and disable, email change, backup
addresses) answered 401, so a typo signed the user out instead of showing the
error. Those now answer 403.

401 is for a missing, expired or refused sign-in, which dependencies.py
raises, and for the sign-in endpoints themselves. Any other 401 in a router
fails here: answer 403 (or 400) instead.
"""
import ast
from pathlib import Path

ROUTERS = Path(__file__).resolve().parents[1] / "app" / "routers"

# Endpoints a signed-out visitor calls to sign in.
SIGN_IN = {("auth.py", "verify_magic_link"), ("auth.py", "password_login")}


def _is_401(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant) and node.value == 401:
        return True
    return isinstance(node, ast.Attribute) and node.attr == "HTTP_401_UNAUTHORIZED"


def test_only_sign_in_endpoints_answer_401():
    found = []
    for path in sorted(ROUTERS.glob("*.py")):
        tree = ast.parse(path.read_text())
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if (path.name, func.name) in SIGN_IN:
                continue
            for node in ast.walk(func):
                if isinstance(node, ast.keyword) and node.arg == "status_code" and _is_401(node.value):
                    found.append(f"{path.name}:{node.value.lineno} in {func.name}")
    assert not found, "A 401 here signs the user out. Answer 403 instead:\n" + "\n".join(found)
