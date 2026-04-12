import { Module } from '@nestjs/common';
import { VaultController } from './vault.controller.js';
import { VaultService } from './vault.service.js';

@Module({
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
