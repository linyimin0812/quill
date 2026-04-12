import { Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from './storage.provider.js';
import { SqliteStorageProvider } from './sqlite.provider.js';
import { StorageService } from './storage.service.js';
import { StorageController } from './storage.controller.js';

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: SqliteStorageProvider,
    },
    StorageService,
  ],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
