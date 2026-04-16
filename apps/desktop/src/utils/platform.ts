/**
 * Platform detection utilities for Tauri / Web environments.
 *
 * Tauri v2 on macOS uses `https://tauri.localhost/` as the origin,
 * so `window.location.protocol` is `'https:'` — not `'tauri:'`.
 * We detect the Tauri environment by checking the hostname instead.
 */

/** Whether the app is running inside a Tauri webview. */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hostname === 'tauri.localhost' ||
    window.location.protocol === 'tauri:'
  );
}

/** Sidecar API base URL (absolute in Tauri, empty string in browser dev). */
const SIDECAR_ORIGIN = 'http://localhost:3001';

export function getSidecarOrigin(): string {
  return isTauri() ? SIDECAR_ORIGIN : '';
}

/** Full API base URL including the global prefix. */
export function getApiBase(): string {
  return `${getSidecarOrigin()}/quill/api`;
}
