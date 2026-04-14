import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';

const AUTH_ENABLED_KEY = 'auth:enabled';
const AUTH_TOKEN_KEY = 'auth:token';

@Injectable()
export class AuthService {
  constructor(private readonly storage: StorageService) {}

  /** Check whether password protection is enabled */
  async isEnabled(): Promise<boolean> {
    const value = await this.storage.get(AUTH_ENABLED_KEY);
    return value === 'true';
  }

  /** Get the current auth status (enabled + whether a token is set) */
  async getStatus(): Promise<{ enabled: boolean; hasToken: boolean }> {
    const enabled = await this.isEnabled();
    const token = await this.storage.get(AUTH_TOKEN_KEY);
    return { enabled, hasToken: !!token };
  }

  /** Verify a token against the stored one */
  async verify(token: string): Promise<boolean> {
    const stored = await this.storage.get(AUTH_TOKEN_KEY);
    if (!stored) return false;
    return token === stored;
  }

  /** Enable or disable password protection */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.storage.set(AUTH_ENABLED_KEY, String(enabled));
  }

  /** Set (or update) the access token / password */
  async setToken(token: string): Promise<void> {
    await this.storage.set(AUTH_TOKEN_KEY, token);
  }

  /** Remove the access token and disable protection */
  async removeToken(): Promise<void> {
    await this.storage.delete(AUTH_TOKEN_KEY);
    await this.storage.set(AUTH_ENABLED_KEY, 'false');
  }
}
