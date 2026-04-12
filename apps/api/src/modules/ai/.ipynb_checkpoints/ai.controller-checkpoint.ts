import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { AiService } from './ai.service.js';
import type { ChatRequest } from './providers/Provider.js';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('models')
  getModels() {
    return this.aiService.getAvailableModels();
  }

  @Post('chat')
  async chat(
    @Body() dto: ChatRequest & { mode?: 'chat' | 'agent' },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = dto.mode === 'agent'
      ? this.aiService.streamAgent(dto)
      : this.aiService.streamChat(dto);

    try {
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal error';
      res.write(`data: ${JSON.stringify({ type: 'error', content: message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
