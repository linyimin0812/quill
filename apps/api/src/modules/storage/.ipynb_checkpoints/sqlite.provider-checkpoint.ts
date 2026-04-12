import { Injectable, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { StorageProvider } from './storage.provider.js';

/**
 * SQLite-based StorageProvider using better-sqlite3.
 * Database file: ~/.quill/quill.db (configurable via QUILL_DB_PATH env var).
 */
@Injectable()
export class SqliteStorageProvider implements StorageProvider, OnModuleInit {
  private db!: import('better-sqlite3').Database;

  async onModuleInit(): Promise<void> {
    const dbPath = process.env.QUILL_DB_PATH
      || path.join(os.homedir(), '.quill', 'quill.db');

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const { default: Database } = await import('better-sqlite3');
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');

    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    console.log(`[Storage] SQLite database initialized at ${dbPath}`);
  }

  async get(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO kv_store (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, value);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
  }

  async list(prefix?: string): Promise<{ key: string; value: string }[]> {
    if (prefix) {
      return this.db
        .prepare('SELECT key, value FROM kv_store WHERE key LIKE ? ORDER BY key')
        .all(`${prefix}%`) as { key: string; value: string }[];
    }
    return this.db
      .prepare('SELECT key, value FROM kv_store ORDER BY key')
      .all() as { key: string; value: string }[];
  }
}
