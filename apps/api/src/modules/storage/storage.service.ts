import { Injectable, Inject } from '@nestjs/common';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider.js';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  async get(key: string): Promise<string | null> {
    return this.provider.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    return this.provider.set(key, value);
  }

  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  async list(prefix?: string): Promise<{ key: string; value: string }[]> {
    return this.provider.list(prefix);
  }
}
