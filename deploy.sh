#!/usr/bin/env bash
# Mirror this folder into the GitHub Pages repo, commit and push to main, then wait for Pages.
#   ./deploy.sh "commit message"
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${BB_REPO:-/workspace/bb3d-web-repo}"
MSG="${1:-Update 3D game}"
[ -d "$REPO/.git" ] || git clone https://github.com/BlaseFlat/ballbuster-empire.git "$REPO"
cd "$REPO" && git pull -q --rebase origin main || true
find "$REPO" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$HERE/." "$REPO/"
rm -rf "$REPO/node_modules" "$REPO/tools/node_modules"; [ -d "$REPO/tools" ] && find "$REPO/tools" -mindepth 1 -maxdepth 1 ! -name audio -exec rm -rf {} + || true
cd "$REPO"
git add -A
if git diff --cached --quiet; then echo "nothing to commit"; else git commit -q -m "$MSG" && git push -q origin main; fi
SHA="$(git rev-parse HEAD)"
echo "pushed $SHA — waiting for GitHub Pages…"
for i in $(seq 1 60); do
  R="$(gh api repos/BlaseFlat/ballbuster-empire/pages/builds/latest --jq '.status + " " + .commit' 2>/dev/null || true)"
  if [ "$R" = "built $SHA" ]; then echo "Pages built: https://blaseflat.github.io/ballbuster-empire/"; exit 0; fi
  case "$R" in errored*) echo "Pages build errored: $R" >&2; exit 1;; esac
  sleep 10
done
echo "timed out waiting for Pages (last: $R)" >&2; exit 1
