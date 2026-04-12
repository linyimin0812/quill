import { Injectable } from '@nestjs/common';

export interface AppSettings {
  theme: 'light' | 'dark';
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  autoSave: boolean;
  autoSaveInterval: number;
  spellCheck: boolean;
  defaultVaultProvider: string;
  aiModel: string;
  locale: string;
}

@Injectable()
export class SettingsService {
  private settings: AppSettings = {
    theme: 'light',
    fontSize: 14,
    lineHeight: 1.7,
    fontFamily: 'JetBrains Mono',
    autoSave: true,
    autoSaveInterval: 3000,
    spellCheck: false,
    defaultVaultProvider: 'local',
    aiModel: 'qwen-turbo',
    locale: 'zh-CN',
  };

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial };
    return { ...this.settings };
  }
}
