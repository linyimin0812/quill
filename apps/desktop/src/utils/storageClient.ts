/**
 * Client for the backend KV storage API.
 * All configuration data (vault configs, editor prefs, settings) is
 * persisted through this client instead of localStorage.
 */
import { authHeaders } from './authToken';
import { getSidecarOrigin } from './platform';

/** Detect API base URL: absolute in Tauri, relative in browser dev */
function getApiBase(): string {
  return `${getSidecarOrigin()}/quill/api/storage`;
}

const BASE = getApiBase();

export const storageClient = {
  /** Get a typed value by key. Returns null if not found. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const response = await fetch(`${BASE}/${encodeURIComponent(key)}`, {
        headers: authHeaders(),
      });
      if (!response.ok) return null;
      const { value } = await response.json();
      if (value === null || value === undefined) return null;
      return JSON.parse(value) as T;
    } catch {
      console.warn(`[storageClient] Failed to get key: ${key}`);
      return null;
    }
  },

  /** Set a value (serialized as JSON). */
  async set(key: string, data: unknown): Promise<void> {
    try {
      await fetch(`${BASE}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ value: JSON.stringify(data) }),
      });
    } catch {
      console.warn(`[storageClient] Failed to set key: ${key}`);
    }
  },

  /** Delete a key. */
  async remove(key: string): Promise<void> {
    try {
      await fetch(`${BASE}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    } catch {
      console.warn(`[storageClient] Failed to remove key: ${key}`);
    }
  },
};
