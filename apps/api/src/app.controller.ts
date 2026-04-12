import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
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
