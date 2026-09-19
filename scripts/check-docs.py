#!/usr/bin/env python3
"""Checks the documentation site for the mistakes that are easy to make and
hard to see: a link to a page that does not exist, a figure with no file
behind it, a figure with no alt text, a page missing part of its front
matter, and the Liquid braces that break a Jekyll build.

    python3 scripts/check-docs.py

Exits non-zero if anything is wrong, so it can gate a commit.
"""

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"

# Pages that are deliberately not published, so nothing should link to them
# and they are not held to the front-matter rules. Read from _config.yml's own
# exclude list rather than repeated here, because the two drifting apart is how
# a page ends up linking to something the build never publishes: docs/DESIGN.md
# and docs/DEVELOPMENT.md were excluded from the site but still counted as
# valid link targets by this script until 2026-09-19.
EXCLUDED_DIRS = {"concepts"}


def unpublished():
    """Top-level docs/*.md paths that _config.yml keeps out of the build."""
    config = (REPO / "_config.yml").read_text(encoding="utf-8")
    names = set()
    in_exclude = False
    for line in config.splitlines():
        if line.startswith("exclude:"):
            in_exclude = True
            continue
        if in_exclude:
            if line.startswith("  - "):
                names.add(line[4:].strip().strip('"'))
            elif line.strip() and not line.startswith(("  #", "#")):
                break
    return names

REQUIRED_FRONT_MATTER = [
    "title", "summary", "kind", "audience", "owner", "revised", "review_by",
    "applies_to", "permalink",
]
VALID_KINDS = {"Tutorial", "How-to", "Reference", "Explanation"}

LINK = re.compile(r"\]\((/[^)\s]*)\)")
IMG = re.compile(r"<img\s+([^>]*?)>", re.S)
SRC = re.compile(r'src="([^"]+)"')
ALT = re.compile(r'alt="([^"]*)"')
FRONT_MATTER = re.compile(r"\A---\n(.*?)\n---\n", re.S)
RAW_BLOCK = re.compile(r"\{%\s*raw\s*%\}.*?\{%\s*endraw\s*%\}", re.S)


def pages():
    excluded = unpublished()
    for path in sorted(DOCS.rglob("*.md")):
        if set(path.relative_to(DOCS).parts) & EXCLUDED_DIRS:
            continue
        if str(path.relative_to(REPO)) in excluded:
            continue
        yield path


def main():
    problems = []
    permalinks = {}

    for path in pages():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO)
        match = FRONT_MATTER.match(text)
        if not match:
            # The technical documents at the top of docs/ predate the site and
            # are not path pages. Jekyll still publishes them, at the pretty
            # permalink its own rules give them, so they are valid link targets
            # even though nothing declares a permalink for them.
            if path.parent == DOCS:
                permalinks[f"/docs/{path.stem}/"] = rel
                continue
            problems.append(f"{rel}: no front matter")
            continue

        block = match.group(1)
        fields = dict(
            (line.split(":", 1)[0].strip(), line.split(":", 1)[1].strip())
            for line in block.splitlines()
            if ":" in line and not line.startswith((" ", "\t", "-"))
        )
        for key in REQUIRED_FRONT_MATTER:
            if key not in fields:
                problems.append(f"{rel}: front matter is missing '{key}'")
        kind = fields.get("kind")
        if kind and kind not in VALID_KINDS:
            problems.append(
                f"{rel}: kind is '{kind}', not one of {', '.join(sorted(VALID_KINDS))}"
            )
        if "permalink" in fields:
            permalinks[fields["permalink"].rstrip("/") + "/"] = rel

    # Second pass, now that every permalink is known.
    for path in pages():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO)

        # A raw block is the documented escape hatch, so braces inside one are
        # not bare.
        if re.search(r"\{\{|\}\}", RAW_BLOCK.sub("", text)):
            problems.append(f"{rel}: contains bare double braces, which Jekyll reads as Liquid")

        for target in LINK.findall(text):
            target = target.split("#")[0]
            if not target.startswith("/docs/"):
                continue
            if target.rstrip("/") + "/" not in permalinks:
                problems.append(f"{rel}: links to {target}, which no page claims")

        for attrs in IMG.findall(text):
            src = SRC.search(attrs)
            alt = ALT.search(attrs)
            if not src:
                problems.append(f"{rel}: an img tag has no src")
                continue
            if alt is None:
                problems.append(f"{rel}: {src.group(1)} has no alt attribute")
            elif not alt.group(1).strip():
                problems.append(f"{rel}: {src.group(1)} has empty alt text")
            if src.group(1).startswith("/"):
                if not (REPO / src.group(1).lstrip("/")).exists():
                    problems.append(f"{rel}: {src.group(1)} does not exist")

    # Every page the navigation offers has to be a page that exists.
    nav = REPO / "_data" / "nav.yml"
    if nav.exists():
        for url in re.findall(r"url:\s*(/docs/\S*)", nav.read_text(encoding="utf-8")):
            if url.rstrip("/") + "/" not in permalinks:
                problems.append(f"_data/nav.yml: offers {url}, which no page claims")

    if problems:
        print(f"{len(problems)} problems:\n")
        for problem in problems:
            print(f"  {problem}")
        return 1

    print(f"{len(permalinks)} pages, no problems.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
