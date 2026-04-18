import { Controller, Get, Post, Put, Delete, Body, Query, Headers, Res } from '@nestjs/common';
import { Response } from 'express';
import { VaultService } from './vault.service.js';
import { Public } from '../auth/auth.guard.js';

@Controller('vault')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  // ── Ping ──

  @Public()
  @Get('ping')
  async ping() {
    return this.vaultService.ping();
  }

  // ── File Operations ──

  @Get('file')
  async readFile(
    @Query('path') filePath: string,
    @Headers('x-vault-root') vaultRoot: string,
    @Res() res: Response,
  ) {
    const content = await this.vaultService.readFile(filePath, vaultRoot);
    res.type('text/plain').send(content);
  }

  @Put('file')
  async writeFile(
    @Body() dto: { path: string; content: string },
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    await this.vaultService.writeFile(dto.path, dto.content, vaultRoot);
    return { ok: true };
  }

  @Delete('file')
  async deleteFile(
    @Query('path') filePath: string,
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    await this.vaultService.deleteFile(filePath, vaultRoot);
    return { ok: true };
  }

  // ── Directory Operations ──

  @Get('list')
  async listFiles(
    @Query('path') dirPath: string,
    @Query('recursive') recursive: string,
    @Query('showHidden') showHidden: string,
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    return this.vaultService.listFiles(dirPath, vaultRoot, recursive === 'true', showHidden === 'true');
  }

  @Post('dir')
  async createDir(
    @Body() dto: { path: string },
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    await this.vaultService.createDir(dto.path, vaultRoot);
    return { ok: true };
  }

  @Delete('dir')
  async deleteDir(
    @Query('path') dirPath: string,
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    await this.vaultService.deleteDir(dirPath, vaultRoot);
    return { ok: true };
  }

  // ── Rename ──

  @Post('rename')
  async rename(
    @Body() dto: { oldPath: string; newPath: string },
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    await this.vaultService.rename(dto.oldPath, dto.newPath, vaultRoot);
    return { ok: true };
  }

  // ── Search ──

  @Get('search')
  async search(
    @Query('q') query: string,
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    return this.vaultService.search(query, vaultRoot);
  }

  // ── Image / Binary Upload ──

  @Post('upload')
  async uploadFile(
    @Body() dto: { path: string; base64: string; mimeType: string },
    @Headers('x-vault-root') vaultRoot: string,
  ) {
    await this.vaultService.uploadBinaryFile(dto.path, dto.base64, vaultRoot);
    return { ok: true, path: dto.path };
  }

  @Public()
  @Get('image')
  async getImage(
    @Query('path') filePath: string,
    @Query('root') queryRoot: string,
    @Headers('x-vault-root') headerRoot: string,
    @Res() res: Response,
  ) {
    const vaultRoot = queryRoot || headerRoot;
    const buffer = await this.vaultService.readBinaryFile(filePath, vaultRoot);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };
    res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  }

  // ── Browse server directories (for vault root selection) ──

  @Get('browse')
  async browse(@Query('path') browsePath: string) {
    return this.vaultService.browseDirectories(browsePath);
  }

  // ── Capabilities ──

  @Get('capabilities')
  getCapabilities() {
    return this.vaultService.getCapabilities();
  }
}
