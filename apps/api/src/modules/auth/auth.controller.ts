import { Controller, Get, Post, Body, HttpCode, HttpStatus, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public } from './auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Get current auth status — always public */
  @Public()
  @Get('status')
  async getStatus() {
    return this.authService.getStatus();
  }

  /** Verify a token — always public */
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('Token is required');
    }
    const valid = await this.authService.verify(body.token);
    if (!valid) {
      throw new UnauthorizedException('Invalid token');
    }
    return { success: true };
  }

  /** Set or update the access token (requires existing auth if enabled) */
  @Post('set-token')
  @HttpCode(HttpStatus.OK)
  async setToken(@Body() body: { token: string; enabled?: boolean }) {
    if (!body.token || body.token.trim().length === 0) {
      throw new BadRequestException('Token must not be empty');
    }
    await this.authService.setToken(body.token.trim());
    if (body.enabled !== undefined) {
      await this.authService.setEnabled(body.enabled);
    } else {
      await this.authService.setEnabled(true);
    }
    return { success: true };
  }

  /** Disable password protection and remove token */
  @Post('disable')
  @HttpCode(HttpStatus.OK)
  async disable() {
    await this.authService.removeToken();
    return { success: true };
  }
}
