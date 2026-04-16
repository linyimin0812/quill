#!/usr/bin/env bash
# Build the NestJS API and package it as a Tauri sidecar resource.
# Uses @vercel/ncc to bundle into a single file, drastically reducing size.
# Only native modules (better-sqlite3) are kept in node_modules.
# Output: apps/desktop/src-tauri/binaries/quill-api-bundle/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$API_DIR/../.." && pwd)"
TAURI_DIR="$(cd "$API_DIR/../desktop/src-tauri" && pwd)"
BINARIES_DIR="$TAURI_DIR/binaries"

echo "==> Building NestJS API..."
cd "$API_DIR"
pnpm build

echo "==> Bundling with ncc..."
SIDECAR_STAGING="$BINARIES_DIR/quill-api-bundle"
rm -rf "$SIDECAR_STAGING"
mkdir -p "$SIDECAR_STAGING"

# Use ncc to bundle the compiled NestJS app into a single file.
# --minify: minify the output for smaller size
# -e better-sqlite3: exclude native module from bundling (must be shipped separately)
npx --yes @vercel/ncc build "$API_DIR/dist/main.js" \
  -o "$SIDECAR_STAGING/dist" \
  --minify \
  -e better-sqlite3

echo "==> Copying native modules..."

# Copy only better-sqlite3 (native addon, cannot be bundled by ncc)
BETTER_SQLITE3_DIR=""
# Resolve the real path of better-sqlite3 from pnpm's virtual store
BETTER_SQLITE3_DIR=$(node -e "
  try {
    const p = require.resolve('better-sqlite3/package.json');
    console.log(require('path').dirname(p));
  } catch { process.exit(1); }
" 2>/dev/null) || true

if [ -n "$BETTER_SQLITE3_DIR" ] && [ -d "$BETTER_SQLITE3_DIR" ]; then
  mkdir -p "$SIDECAR_STAGING/node_modules/better-sqlite3"
  # Copy only essential files: prebuilds (native .node files), package.json, and JS entry
  cp "$BETTER_SQLITE3_DIR/package.json" "$SIDECAR_STAGING/node_modules/better-sqlite3/"
  cp -r "$BETTER_SQLITE3_DIR/lib" "$SIDECAR_STAGING/node_modules/better-sqlite3/"
  if [ -d "$BETTER_SQLITE3_DIR/prebuilds" ]; then
    cp -r "$BETTER_SQLITE3_DIR/prebuilds" "$SIDECAR_STAGING/node_modules/better-sqlite3/"
  fi
  if [ -d "$BETTER_SQLITE3_DIR/build" ]; then
    cp -r "$BETTER_SQLITE3_DIR/build" "$SIDECAR_STAGING/node_modules/better-sqlite3/"
  fi
  # Copy bindings dependency if present
  BINDINGS_DIR=$(node -e "
    try {
      const p = require.resolve('bindings/package.json');
      console.log(require('path').dirname(p));
    } catch { process.exit(1); }
  " 2>/dev/null) || true
  if [ -n "$BINDINGS_DIR" ] && [ -d "$BINDINGS_DIR" ]; then
    mkdir -p "$SIDECAR_STAGING/node_modules/bindings"
    cp -rL "$BINDINGS_DIR"/* "$SIDECAR_STAGING/node_modules/bindings/"
  fi
  # Copy file-uri-to-path dependency if present (needed by bindings)
  FILE_URI_DIR=$(node -e "
    try {
      const p = require.resolve('file-uri-to-path/package.json');
      console.log(require('path').dirname(p));
    } catch { process.exit(1); }
  " 2>/dev/null) || true
  if [ -n "$FILE_URI_DIR" ] && [ -d "$FILE_URI_DIR" ]; then
    mkdir -p "$SIDECAR_STAGING/node_modules/file-uri-to-path"
    cp -rL "$FILE_URI_DIR"/* "$SIDECAR_STAGING/node_modules/file-uri-to-path/"
  fi
  echo "  OK: better-sqlite3 (native module)"
else
  echo "  WARN: better-sqlite3 not found, skipping"
fi

# Create a minimal package.json for the bundle
cat > "$SIDECAR_STAGING/package.json" << 'PKG'
{
  "name": "quill-api-bundle",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js"
}
PKG

# Report bundle size
BUNDLE_SIZE=$(du -sh "$SIDECAR_STAGING" | cut -f1)
FILE_COUNT=$(find "$SIDECAR_STAGING" -type f | wc -l | tr -d ' ')
echo "==> Bundle created: $SIDECAR_STAGING ($FILE_COUNT files, $BUNDLE_SIZE)"
