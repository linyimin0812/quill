/**
 * Abstract storage provider interface for KV-style configuration storage.
 * Implementations can use SQLite, MySQL, PostgreSQL, etc.
 */
export interface StorageProvider {
  /** Get a value by key. Returns null if not found. */
  get(key: string): Promise<string | null>;

  /** Set a value (upsert semantics). */
  set(key: string, value: string): Promise<void>;

  /** Delete a key. */
  delete(key: string): Promise<void>;

  /** List all entries, optionally filtered by key prefix. */
  list(prefix?: string): Promise<{ key: string; value: string }[]>;
}

/** Injection token for the StorageProvider */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
