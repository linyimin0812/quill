import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/auth.guard.js';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'quill-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
