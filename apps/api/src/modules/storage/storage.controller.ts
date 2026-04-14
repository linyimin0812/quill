import { Controller, Get, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { Public } from '../auth/auth.guard.js';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get()
  async list(@Query('prefix') prefix?: string) {
    return this.storageService.list(prefix);
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    const value = await this.storageService.get(key);
    return { value };
  }

  @Put(':key')
  async set(@Param('key') key: string, @Body() dto: { value: string }) {
    await this.storageService.set(key, dto.value);
    return { ok: true };
  }

  @Delete(':key')
  async remove(@Param('key') key: string) {
    await this.storageService.delete(key);
    return { ok: true };
  }
}
