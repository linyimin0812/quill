import type { VaultProvider } from './provider.interface';
import type { ProviderType, VaultConfig } from './types';
import { ServerVaultProvider } from './providers/server.provider';

/** Descriptor for registering a provider factory */
export interface VaultProviderDescriptor {
  type: ProviderType;
  displayName: string;
  icon: string;
  description: string;
  factory: (config: VaultConfig) => VaultProvider;
}

/**
 * Registry for vault provider factories.
 * Supports both built-in and third-party custom providers.
 */
export class VaultProviderRegistry {
  private static instance: VaultProviderRegistry;
  private descriptors = new Map<ProviderType, VaultProviderDescriptor>();

  private constructor() {
    this.registerBuiltins();
  }

  static getInstance(): VaultProviderRegistry {
    if (!VaultProviderRegistry.instance) {
      VaultProviderRegistry.instance = new VaultProviderRegistry();
    }
    return VaultProviderRegistry.instance;
  }

  /** Register a provider factory */
  register(descriptor: VaultProviderDescriptor): void {
    this.descriptors.set(descriptor.type, descriptor);
  }

  /** Get a provider descriptor by type */
  get(type: ProviderType): VaultProviderDescriptor | undefined {
    return this.descriptors.get(type);
  }

  /** Get all registered descriptors */
  getAll(): VaultProviderDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /** Create a provider instance from config */
  create(config: VaultConfig): VaultProvider {
    const descriptor = this.descriptors.get(config.providerType);
    if (!descriptor) {
      throw new Error(`No provider registered for type: ${config.providerType}`);
    }
    return descriptor.factory(config);
  }

  /** Register built-in providers */
  private registerBuiltins(): void {
    this.register({
      type: 'server',
      displayName: '服务器存储',
      icon: '🖥',
      description: '通过 API 读写服务器端文件系统',
      factory: () => new ServerVaultProvider(),
    });
  }
}
