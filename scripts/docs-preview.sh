#!/usr/bin/env bash
#
# Publishes the current branch to the throwaway documentation preview site.
#
# GitHub Pages serves one site per repository from one branch, so a docs branch
# is invisible until it merges, and merging a half-built site is the one
# outcome the feature branch exists to avoid. This pushes the branch to a
# separate repository with Pages enabled, which is the real Pages build: same
# plugin set, same Jekyll version, nothing installed on this host.
#
#   scripts/docs-preview.sh              publish the current branch
#   scripts/docs-preview.sh --open       publish, then print the URL
#
# WHAT THE PREVIEW DOES NOT PROVE
#
# The preview lives at a subpath (/ectlogger-docs-preview/) rather than at the
# root of a domain, so this script rewrites `baseurl` and `url` before pushing.
# Anything built from a root-absolute path is therefore wrong on the preview
# and right in production:
#
#   - <img src="/docs/img/..."> in a page will 404 on the preview
#   - any hand-written href starting with a single slash will point one level
#     too high
#
# Links emitted by the layouts go through Liquid's relative_url and are fine.
# What the preview is actually for is the thing that has no other safety net: a
# Liquid or YAML error in a layout takes down every page of the real site at
# once, and this is where that shows up first.
#
# Delete the preview repository when the branch merges.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREVIEW_REPO="ectlogger-docs-preview"
OWNER="$(gh api user -q .login)"
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

if [[ "$BRANCH" == "main" ]]; then
  echo "Refusing to preview main: main is already published at ectlogger.us." >&2
  exit 1
fi

echo "Branch:  $BRANCH"
echo "Preview: https://${OWNER}.github.io/${PREVIEW_REPO}/"

# Create the preview repository on first run.
if ! gh repo view "${OWNER}/${PREVIEW_REPO}" >/dev/null 2>&1; then
  echo "Creating ${OWNER}/${PREVIEW_REPO} ..."
  gh repo create "${OWNER}/${PREVIEW_REPO}" --public \
    --description "Throwaway preview of the ECTLogger documentation site. Delete when feature/docs-site merges."
fi

# Copy the working tree, tracked files only, so nothing uncommitted or ignored
# leaks into a public repository.
git -C "$REPO_ROOT" archive HEAD | tar -x -C "$STAGING"

# The one difference from production, and the reason for the warning above.
python3 - "$STAGING/_config.yml" <<'PY'
import sys, re
path = sys.argv[1]
text = open(path).read()
text = re.sub(r'^url:.*$', 'url: https://GITHUB_OWNER.github.io', text, flags=re.M)
text += "\n# Set by scripts/docs-preview.sh. Production serves from the root of\n"
text += "# ectlogger.us and has no baseurl.\nbaseurl: /ectlogger-docs-preview\n"
open(path, 'w').write(text)
PY
sed -i "s|https://GITHUB_OWNER.github.io|https://${OWNER}.github.io|" "$STAGING/_config.yml"

# A custom domain on the real site would hijack the preview.
rm -f "$STAGING/CNAME"

# The project's own CI has nothing to test here and only produces a red X on a
# repository that exists to render one Jekyll site.
rm -rf "$STAGING/.github/workflows"

cd "$STAGING"
git init -q -b main
git add -A
git -c user.name="docs-preview" -c user.email="docs-preview@localhost" \
  commit -q -m "Preview of ${BRANCH} at $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
git remote add origin "https://github.com/${OWNER}/${PREVIEW_REPO}.git"
git push -q --force origin main

# Enable Pages on first run. Harmless once it is already on.
gh api -X POST "repos/${OWNER}/${PREVIEW_REPO}/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true

echo
echo "Pushed. The build takes about a minute."
echo "  https://${OWNER}.github.io/${PREVIEW_REPO}/"
echo "  gh run list --repo ${OWNER}/${PREVIEW_REPO}   # build status"
