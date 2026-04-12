#!/usr/bin/env bash
# Copy quill-api-bundle into the built Tauri .app bundle.
# Run this AFTER `tauri build`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(cd "$SCRIPT_DIR/../../desktop/src-tauri" && pwd)"
BUNDLE_SRC="$TAURI_DIR/binaries/quill-api-bundle"

# Find the .app bundle (macOS)
APP_DIR=$(find "$TAURI_DIR/target" -name "Quill.app" -type d -maxdepth 5 2>/dev/null | head -1)

if [ -z "$APP_DIR" ]; then
  echo "WARN: Quill.app not found, skipping sidecar injection"
  exit 0
fi

MACOS_DIR="$APP_DIR/Contents/MacOS"

if [ ! -d "$BUNDLE_SRC" ]; then
  echo "ERROR: quill-api-bundle not found at $BUNDLE_SRC"
  exit 1
fi

echo "==> Injecting sidecar into $MACOS_DIR"
cp -r "$BUNDLE_SRC" "$MACOS_DIR/quill-api-bundle"

FILE_COUNT=$(find "$MACOS_DIR/quill-api-bundle" -type f | wc -l | tr -d ' ')
echo "==> Sidecar injected ($FILE_COUNT files)"

# Also inject into .dmg staging if it exists
DMG_APP=$(find "$TAURI_DIR/target" -path "*/bundle/dmg/Quill.app" -type d -maxdepth 7 2>/dev/null | head -1)
if [ -n "$DMG_APP" ] && [ "$DMG_APP" != "$APP_DIR" ]; then
  echo "==> Also injecting into DMG bundle: $DMG_APP"
  cp -r "$BUNDLE_SRC" "$DMG_APP/Contents/MacOS/quill-api-bundle"
fi

echo "==> Done!"
