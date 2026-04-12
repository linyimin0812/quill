import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface VaultEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
  lastModified?: string;
}

@Injectable()
export class VaultService {
  private readonly defaultRoot: string;

  constructor() {
    this.defaultRoot = process.env.QUILL_VAULT_ROOT
      || path.join(os.homedir(), 'quill-vault');
    this.ensureDir(this.defaultRoot);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      throw new BadRequestException(
        `无法创建目录 "${dirPath}"，请确认路径存在且有写入权限。原始错误: ${(err as Error).message}`,
      );
    }
  }

  /** Get the effective vault root: use request-provided root or fall back to default */
  private getRoot(vaultRoot?: string): string {
    const raw = vaultRoot?.trim() || this.defaultRoot;
    // Expand ~ to home directory
    if (raw.startsWith('~/') || raw === '~') {
      return path.join(os.homedir(), raw.slice(1));
    }
    return raw;
  }

  /** Resolve and validate a path within the vault root (prevent traversal) */
  private resolveSafe(relativePath: string, vaultRoot?: string): string {
    const root = path.resolve(this.getRoot(vaultRoot));
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(root)) {
      throw new BadRequestException('Path traversal is not allowed');
    }
    return resolved;
  }

  // ── File Operations ──

  async readFile(filePath: string, vaultRoot?: string): Promise<string> {
    const resolved = this.resolveSafe(filePath, vaultRoot);
    try {
      return await fs.readFile(resolved, 'utf-8');
    } catch {
      throw new NotFoundException(`File not found: ${filePath}`);
    }
  }

  async writeFile(filePath: string, content: string, vaultRoot?: string): Promise<void> {
    const resolved = this.resolveSafe(filePath, vaultRoot);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content ?? '', 'utf-8');
  }

  async deleteFile(filePath: string, vaultRoot?: string): Promise<void> {
    const resolved = this.resolveSafe(filePath, vaultRoot);
    try {
      await fs.unlink(resolved);
    } catch {
      throw new NotFoundException(`File not found: ${filePath}`);
    }
  }

  // ── Directory Operations ──

  async listFiles(dirPath: string, vaultRoot?: string): Promise<VaultEntry[]> {
    const root = this.getRoot(vaultRoot);
    await this.ensureDir(root);
    const resolved = this.resolveSafe(dirPath || '.', vaultRoot);
    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const results: VaultEntry[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const entryPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        const fullPath = path.join(resolved, entry.name);

        if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          results.push({
            path: entryPath,
            name: entry.name,
            type: 'file',
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
          });
        } else if (entry.isDirectory()) {
          results.push({ path: entryPath, name: entry.name, type: 'dir' });
        }
      }

      return results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      throw new NotFoundException(`Directory not found: ${dirPath}`);
    }
  }

  async createDir(dirPath: string, vaultRoot?: string): Promise<void> {
    const root = this.getRoot(vaultRoot);
    await this.ensureDir(root);
    const resolved = this.resolveSafe(dirPath, vaultRoot);
    await fs.mkdir(resolved, { recursive: true });
  }

  async deleteDir(dirPath: string, vaultRoot?: string): Promise<void> {
    const resolved = this.resolveSafe(dirPath, vaultRoot);
    try {
      await fs.rm(resolved, { recursive: true, force: true });
    } catch {
      throw new NotFoundException(`Directory not found: ${dirPath}`);
    }
  }

  // ── Rename ──

  async rename(oldPath: string, newPath: string, vaultRoot?: string): Promise<void> {
    const resolvedOld = this.resolveSafe(oldPath, vaultRoot);
    const resolvedNew = this.resolveSafe(newPath, vaultRoot);
    await fs.mkdir(path.dirname(resolvedNew), { recursive: true });
    try {
      await fs.rename(resolvedOld, resolvedNew);
    } catch {
      throw new NotFoundException(`Path not found: ${oldPath}`);
    }
  }

  // ── Search ──

  async search(query: string, vaultRoot?: string): Promise<VaultEntry[]> {
    const root = this.getRoot(vaultRoot);
    await this.ensureDir(root);
    const results: VaultEntry[] = [];
    const lowerQuery = query.toLowerCase();
    await this.searchRecursive(root, '', lowerQuery, results);
    return results;
  }

  private async searchRecursive(
    dirPath: string,
    relativePath: string,
    query: string,
    results: VaultEntry[],
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && entry.name.toLowerCase().includes(query)) {
        const stat = await fs.stat(fullPath);
        results.push({
          path: entryRelative,
          name: entry.name,
          type: 'file',
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
        });
      } else if (entry.isDirectory()) {
        await this.searchRecursive(fullPath, entryRelative, query, results);
      }
    }
  }

  // ── Browse server directories (for vault root selection) ──

  async browseDirectories(browsePath: string): Promise<VaultEntry[]> {
    const resolved = path.resolve(browsePath || os.homedir());
    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => ({
          path: path.join(resolved, entry.name),
          name: entry.name,
          type: 'dir' as const,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      throw new NotFoundException(`Cannot browse: ${browsePath}`);
    }
  }

  // ── Ping ──

  async ping(): Promise<{ ok: boolean; root: string }> {
    return { ok: true, root: this.defaultRoot };
  }

  // ── Capabilities ──

  getCapabilities() {
    return { writable: true, watch: false, search: true };
  }
}
