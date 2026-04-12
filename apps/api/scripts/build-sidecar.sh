#!/usr/bin/env bash
# Build the NestJS API and package it as a Tauri sidecar resource.
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

echo "==> Packaging sidecar bundle..."
SIDECAR_STAGING="$BINARIES_DIR/quill-api-bundle"
rm -rf "$SIDECAR_STAGING"
mkdir -p "$SIDECAR_STAGING"

# Copy compiled output
cp -r "$API_DIR/dist" "$SIDECAR_STAGING/dist"

# Collect and copy all production dependencies (including transitive ones)
# Uses Node.js to recursively resolve real package paths from pnpm's virtual store
mkdir -p "$SIDECAR_STAGING/node_modules"

VAULT_PROVIDER_DIR="$REPO_ROOT/packages/vault-provider"

echo "==> Resolving production dependencies..."
node -e "
const fs = require('fs');
const path = require('path');

const seen = new Set();
const results = [];

function resolvePackage(name) {
  if (seen.has(name)) return;
  seen.add(name);

  let pkgDir;
  try {
    const pkgJson = require.resolve(name + '/package.json');
    pkgDir = path.dirname(pkgJson);
  } catch {
    return; // optional or peer dep, skip
  }

  results.push({ name, dir: pkgDir });

  // Recurse into this package's dependencies
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) {
      resolvePackage(dep);
    }
  } catch {}
}

// Start from API's package.json dependencies
const apiPkg = JSON.parse(fs.readFileSync('${API_DIR}/package.json', 'utf8'));
for (const dep of Object.keys(apiPkg.dependencies || {})) {
  if (dep === '@quill/vault-provider') continue; // handled separately
  resolvePackage(dep);
}

// Output as JSON lines
for (const r of results) {
  console.log(JSON.stringify(r));
}
" | while IFS= read -r line; do
  dep_name=$(echo "$line" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).name)")
  dep_dir=$(echo "$line" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).dir)")

  if [ -n "$dep_name" ] && [ -n "$dep_dir" ]; then
    mkdir -p "$SIDECAR_STAGING/node_modules/$(dirname "$dep_name")"
    cp -rL "$dep_dir" "$SIDECAR_STAGING/node_modules/$dep_name"
    echo "  OK: $dep_name"
  fi
done

# Copy @quill/vault-provider workspace package
if [ -d "$VAULT_PROVIDER_DIR" ]; then
  echo "  OK: @quill/vault-provider (workspace)"
  mkdir -p "$SIDECAR_STAGING/node_modules/@quill/vault-provider"
  cp -r "$VAULT_PROVIDER_DIR/src" "$SIDECAR_STAGING/node_modules/@quill/vault-provider/src" 2>/dev/null || true
  cp -r "$VAULT_PROVIDER_DIR/dist" "$SIDECAR_STAGING/node_modules/@quill/vault-provider/dist" 2>/dev/null || true
  cp "$VAULT_PROVIDER_DIR/package.json" "$SIDECAR_STAGING/node_modules/@quill/vault-provider/package.json" 2>/dev/null || true
  cp "$VAULT_PROVIDER_DIR/index.ts" "$SIDECAR_STAGING/node_modules/@quill/vault-provider/index.ts" 2>/dev/null || true
fi

# Create a minimal package.json for the bundle
cat > "$SIDECAR_STAGING/package.json" << 'PKG'
{
  "name": "quill-api-bundle",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js"
}
PKG

# Count files for verification
FILE_COUNT=$(find "$SIDECAR_STAGING" -type f | wc -l | tr -d ' ')
echo "==> Bundle created: $SIDECAR_STAGING ($FILE_COUNT files)"
