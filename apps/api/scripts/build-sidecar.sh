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
  # Copy bindings + file-uri-to-path (better-sqlite3 runtime dependencies).
  # pnpm hoists these into .pnpm, so require.resolve won't find them from the API dir.
  # We search the monorepo node_modules/.pnpm directory instead.
  PNPM_STORE="$REPO_ROOT/node_modules/.pnpm"
  BINDINGS_DIR=$(find "$PNPM_STORE" -maxdepth 3 -path "*/bindings@*/node_modules/bindings" -type d 2>/dev/null | head -1)
  if [ -n "$BINDINGS_DIR" ] && [ -d "$BINDINGS_DIR" ]; then
    mkdir -p "$SIDECAR_STAGING/node_modules/bindings"
    cp -rL "$BINDINGS_DIR"/* "$SIDECAR_STAGING/node_modules/bindings/"
    echo "  OK: bindings"
  else
    echo "  WARN: bindings not found in pnpm store"
  fi
  FILE_URI_DIR=$(find "$PNPM_STORE" -maxdepth 3 -path "*/file-uri-to-path@*/node_modules/file-uri-to-path" -type d 2>/dev/null | head -1)
  if [ -n "$FILE_URI_DIR" ] && [ -d "$FILE_URI_DIR" ]; then
    mkdir -p "$SIDECAR_STAGING/node_modules/file-uri-to-path"
    cp -rL "$FILE_URI_DIR"/* "$SIDECAR_STAGING/node_modules/file-uri-to-path/"
    echo "  OK: file-uri-to-path"
  else
    echo "  WARN: file-uri-to-path not found in pnpm store"
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

# Record the Node.js binary path used during build so the Tauri app can use the
# same version at runtime (avoids NODE_MODULE_VERSION mismatch with native addons).
NODE_BIN_PATH="$(which node)"
echo "$NODE_BIN_PATH" > "$SIDECAR_STAGING/.node-path"
echo "==> Recorded node path: $NODE_BIN_PATH ($(node --version))"

# Inject a `require` polyfill at the top of the ESM bundle.
# ncc outputs ESM (starts with `import{createRequire as __WEBPACK_EXTERNAL_createRequire}from"module"`),
# but some bundled CJS modules call the global `require()` directly instead of ncc's __nccwpck_require__.
# In ESM scope `require` is not defined, so we inject a globalThis.require polyfill.
BUNDLE_FILE="$SIDECAR_STAGING/dist/index.js"
PATCH_SCRIPT="$SIDECAR_STAGING/patch-bundle.cjs"
cat > "$PATCH_SCRIPT" << 'PATCH_EOF'
const fs = require('fs');
const filePath = process.argv[2];
let content = fs.readFileSync(filePath, 'utf8');

// 1. Inject globalThis.require polyfill right after ncc's own createRequire import.
//    ncc's ESM bundle starts with: import{createRequire as __WEBPACK_EXTERNAL_createRequire}from"module";
//    We piggyback on that to set globalThis.require synchronously.
const requirePolyfill = 'if(typeof globalThis.require==="undefined"){globalThis.require=__WEBPACK_EXTERNAL_createRequire(import.meta.url);}';
const firstSemicolon = content.indexOf(';');
content = content.slice(0, firstSemicolon + 1) + requirePolyfill + content.slice(firstSemicolon + 1);

// 2. Replace webpackEmptyAsyncContext stubs with real dynamic import().
//    ncc cannot resolve dynamic import() calls at compile time, so it generates
//    empty context modules that always throw MODULE_NOT_FOUND.
//    We replace them with a function that delegates to the native import().
const emptyCtxPattern = /(\d+):e=>\{function webpackEmptyAsyncContext\(e\)\{return Promise\.resolve\(\)\.then\(\(\(\)=>\{var t=new Error\("Cannot find module '"\+e\+"'"\);t\.code="MODULE_NOT_FOUND";throw t\}\)\)\}webpackEmptyAsyncContext\.keys=\(\)=>\[\];webpackEmptyAsyncContext\.resolve=webpackEmptyAsyncContext;webpackEmptyAsyncContext\.id=\1;e\.exports=webpackEmptyAsyncContext\}/g;
const replacement = '$1:e=>{const dynamicImportFallback=e=>import(e);dynamicImportFallback.keys=()=>[];dynamicImportFallback.resolve=dynamicImportFallback;dynamicImportFallback.id=$1;e.exports=dynamicImportFallback}';
content = content.replace(emptyCtxPattern, replacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched bundle successfully');
PATCH_EOF
node "$PATCH_SCRIPT" "$BUNDLE_FILE"
rm -f "$PATCH_SCRIPT"
echo "==> Patched ESM bundle (require polyfill + dynamic import fix)"

# Report bundle size
BUNDLE_SIZE=$(du -sh "$SIDECAR_STAGING" | cut -f1)
FILE_COUNT=$(find "$SIDECAR_STAGING" -type f | wc -l | tr -d ' ')
echo "==> Bundle /Users/banzhe/WebstormProjects/github/quill/apps/desktop/src-tauri/target/release/bundle/macos/: $SIDECAR_STAGING ($FILE_COUNT files, $BUNDLE_SIZE)"
