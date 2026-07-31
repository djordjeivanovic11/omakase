#!/usr/bin/env bash
# Build distributables and prepare a GitHub Release.
# Usage:
#   ./scripts/release.sh           # make artifacts only
#   ./scripts/release.sh --publish # make + gh release create (requires gh auth)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUBLISH=0
if [[ "${1:-}" == "--publish" ]]; then
  PUBLISH=1
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

echo "==> Checking environment"
node ./scripts/check-env.mjs

echo "==> Installing / building contracts"
pnpm install --frozen-lockfile
pnpm build:contracts

echo "==> Running tests"
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm test

echo "==> Packaging desktop distributables"
pnpm --filter @omakase/desktop make
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "==> Building macOS DMG (hdiutil)"
  bash ./scripts/make-macos-dmg.sh
fi

OUT_DIR="apps/desktop/out"
MAKE_DIR="${OUT_DIR}/make"

echo "==> Artifacts under ${MAKE_DIR}"
find "$MAKE_DIR" -type f \( -name '*.dmg' -o -name '*.zip' -o -name '*.exe' -o -name '*.nupkg' \) 2>/dev/null || true

if [[ "$PUBLISH" -eq 0 ]]; then
  echo ""
  echo "Build complete. To publish:"
  echo "  ./scripts/release.sh --publish"
  echo "Or manually:"
  echo "  gh release create ${TAG} --title \"Omakase ${VERSION}\" --notes-file CHANGELOG.md ${MAKE_DIR}/**/*"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required for --publish" >&2
  exit 1
fi

NOTES_FILE="$(mktemp)"
trap 'rm -f "$NOTES_FILE"' EXIT

if [[ -f CHANGELOG.md ]]; then
  # Extract the section for this version if present; otherwise use whole file head.
  awk -v ver="$VERSION" '
    BEGIN { p=0 }
    $0 ~ "^##[[:space:]]+" ver { p=1 }
    p && $0 ~ /^##[[:space:]]+/ && $0 !~ ver { exit }
    p { print }
  ' CHANGELOG.md >"$NOTES_FILE"
fi

if [[ ! -s "$NOTES_FILE" ]]; then
  cat >"$NOTES_FILE" <<EOF
## Omakase ${VERSION}

See the repository README for install instructions.

**Note:** macOS/Windows binaries may be unsigned until notarization credentials are configured. See \`docs/release.md\`.
EOF
fi

shopt -s nullglob
ASSETS=()
while IFS= read -r -d '' f; do
  ASSETS+=("$f")
done < <(find "$MAKE_DIR" -type f \( -name '*.dmg' -o -name '*.zip' -o -name '*.exe' -o -name '*.nupkg' -o -name 'RELEASES' \) -print0 2>/dev/null)

if [[ ${#ASSETS[@]} -eq 0 ]]; then
  echo "No distributable assets found under ${MAKE_DIR}" >&2
  exit 1
fi

echo "==> Creating GitHub release ${TAG}"
gh release create "$TAG" \
  --title "Omakase ${VERSION}" \
  --notes-file "$NOTES_FILE" \
  "${ASSETS[@]}"

echo "Published ${TAG}"
