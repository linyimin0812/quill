import { BaseVaultProvider } from './base.provider';
import type { VaultCapabilities, VaultConfig, VaultEntry } from '../types';
import { VaultError } from '../types';

/**
 * Server vault provider that communicates with a NestJS backend via REST API.
 * Used when Quill runs as a web app deployed on a server — files are stored
 * on the server's file system and accessed through HTTP endpoints.
 */
export class ServerVaultProvider extends BaseVaultProvider {
  readonly id = 'server';
  readonly type: 'server' = 'server';
  readonly displayName = '服务器存储';
  readonly capabilities: VaultCapabilities = {
    writable: true, watch: false, search: true,
    history: false, sharing: false, streaming: false, offline: false,
  };

  private baseUrl = '';
  private vaultBasePath = '';

  /** Detect API base URL: absolute in Tauri, relative in browser dev */
  private static detectBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location.protocol === 'tauri:') {
      return 'http://localhost:3001/quill/vault';
    }
    return '/quill/vault';
  }

  async connect(config: VaultConfig): Promise<void> {
    await super.connect(config);
    this.baseUrl = (config.options?.apiUrl as string) || ServerVaultProvider.detectBaseUrl();
    this.vaultBasePath = config.basePath || '';

    const reachable = await this.ping();
    if (!reachable) {
      throw new VaultError('NETWORK_ERROR', `Cannot reach vault API at ${this.baseUrl}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/ping`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ── File Operations ──

  async readFile(path: string): Promise<string> {
    const response = await this.request(`/file?path=${encodeURIComponent(path)}`);
    return response.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.request('/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
  }

  async deleteFile(path: string): Promise<void> {
    await this.request(`/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  }

  async listFiles(path: string): Promise<VaultEntry[]> {
    const response = await this.request(`/list?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    return (data as RawVaultEntry[]).map(deserializeEntry);
  }

  // ── Directory Operations ──

  async createDir(path: string): Promise<void> {
    await this.request('/dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  }

  async deleteDir(path: string): Promise<void> {
    await this.request(`/dir?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  }

  // ── Search ──

  async search(query: string): Promise<VaultEntry[]> {
    const response = await this.request(`/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return (data as RawVaultEntry[]).map(deserializeEntry);
  }

  // ── Server-specific: Browse server directories (for vault root selection) ──

  async browseServerDirectories(path: string): Promise<VaultEntry[]> {
    const response = await this.request(`/browse?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    return (data as RawVaultEntry[]).map(deserializeEntry);
  }

  // ── Internal Helpers ──

  private async request(endpoint: string, options?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options?.headers);
    if (this.vaultBasePath) {
      headers.set('X-Vault-Root', this.vaultBasePath);
    }
    const response = await fetch(url, { ...options, headers }).catch(() => {
      throw new VaultError('NETWORK_ERROR', `Failed to reach ${url}`);
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      const errorCode = response.status === 404 ? 'NOT_FOUND'
        : response.status === 403 ? 'PERMISSION_DENIED'
        : response.status === 409 ? 'CONFLICT'
        : 'NETWORK_ERROR';
      throw new VaultError(errorCode, `${response.status}: ${errorBody}`);
    }

    return response;
  }
}

/** Raw shape returned by the server before Date deserialization */
interface RawVaultEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
  lastModified?: string;
  etag?: string;
}

function deserializeEntry(raw: RawVaultEntry): VaultEntry {
  return {
    ...raw,
    lastModified: raw.lastModified ? new Date(raw.lastModified) : undefined,
  };
}
