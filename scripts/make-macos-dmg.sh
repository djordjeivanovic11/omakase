#!/usr/bin/env bash
# Package the macOS arm64 .app (if needed) and build a UDZO .dmg with hdiutil.
# Avoids the fragile appdmg / macos-alias native toolchain used by Electron Forge MakerDMG.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" ]]; then
  echo "This script currently builds the Apple Silicon artifact (host arch=$ARCH)." >&2
fi

APP_DIR="apps/desktop/out/Omakase-darwin-arm64/Omakase.app"
MAKE_DIR="apps/desktop/out/make"
DMG_PATH="${MAKE_DIR}/Omakase-darwin-arm64.dmg"

echo "==> Ensuring Node 24 / contracts"
# shellcheck disable=SC1090
source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
if command -v nvm >/dev/null 2>&1; then
  nvm use 24 >/dev/null || true
fi

pnpm --filter @omakase/contracts build

if [[ ! -x "${APP_DIR}/Contents/MacOS/Omakase" ]]; then
  echo "==> Packaging desktop app"
  pnpm --filter @omakase/desktop package
fi

mkdir -p "$MAKE_DIR"
echo "==> Creating DMG at ${DMG_PATH}"
rm -f "$DMG_PATH"
hdiutil create \
  -volname "Omakase" \
  -srcfolder "$APP_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo "==> Done"
ls -lh "$DMG_PATH"
echo "App: ${APP_DIR}"
