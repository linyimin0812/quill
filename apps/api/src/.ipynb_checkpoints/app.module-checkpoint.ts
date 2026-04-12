import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { VaultModule } from './modules/vault/vault.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { StorageModule } from './modules/storage/storage.module.js';

@Module({
  imports: [VaultModule, SearchModule, AiModule, SettingsModule, StorageModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
