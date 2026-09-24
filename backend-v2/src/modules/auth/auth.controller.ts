import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';

import { CurrentUser, Public } from './auth.decorators.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  tokenQuerySchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser, PublicUser } from './auth.types.js';

const GENERIC_RESET_MESSAGE =
  'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.';

@ApiTags('Authentication')
@Controller(['api/v1/auth', 'api/v2/auth'])
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body({ schema: registerSchema }) body: RegisterInput): Promise<PublicUser> {
    return this.auth.register(body);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() request: FastifyRequest,
  ): Promise<{ access_token: string; refresh_token: string; token_type: 'bearer' }> {
    return this.auth.login(body, {
      ip: request.ip ?? null,
      userAgent: headerValue(request.headers['user-agent']),
    });
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body({ schema: refreshSchema }) body: RefreshInput,
  ): Promise<{ access_token: string; refresh_token: string; token_type: 'bearer' }> {
    return this.auth.refresh(body.refresh_token);
  }

  @HttpCode(200)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<{ message: string }> {
    await this.auth.logout(user.id);
    return { message: 'Đăng xuất thành công' };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.auth.getPublicUser(user.id);
  }

  @Public()
  @Get('verify-email')
  @Header('content-type', 'text/html; charset=utf-8')
  async verifyEmail(
    @Query({ schema: tokenQuerySchema }) query: { token: string },
  ): Promise<string> {
    try {
      await this.auth.verifyEmail(query.token);
      return resultPage(
        true,
        'Email của bạn đã được xác thực thành công. Bạn có thể đóng trang này.',
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return resultPage(false, 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.');
      }
      throw error;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body({ schema: forgotPasswordSchema }) body: ForgotPasswordInput): {
    message: string;
  } {
    void this.auth.forgotPassword(body.email).catch(() => undefined);
    return { message: GENERIC_RESET_MESSAGE };
  }

  @Public()
  @Get('reset-password')
  @Header('content-type', 'text/html; charset=utf-8')
  resetPasswordForm(
    @Query({ schema: tokenQuerySchema }) query: { token: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): string {
    const nonce = randomBytes(18).toString('base64url');
    reply.header(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    );
    reply.header('Cache-Control', 'no-store');
    return resetFormPage(query.token, nonce);
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(
    @Body({ schema: resetPasswordSchema }) body: ResetPasswordInput,
  ): Promise<{ message: string }> {
    await this.auth.resetPassword(body.token, body.new_password);
    return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' };
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function resultPage(success: boolean, message: string): string {
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><title>IQX</title><body><main><h1>${success ? 'Thành công' : 'Không thành công'}</h1><p>${message}</p></main></body></html>`;
}

function resetFormPage(token: string, nonce: string): string {
  const safeToken = JSON.stringify(token).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Đặt lại mật khẩu</title><body><main><h1>Đặt lại mật khẩu</h1><form id="reset"><input id="password" type="password" minlength="8" maxlength="128" required autocomplete="new-password"><button>Đặt lại</button></form><p id="result"></p><script nonce="${nonce}">const token=${safeToken};document.getElementById('reset').addEventListener('submit',async(e)=>{e.preventDefault();const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,new_password:document.getElementById('password').value})});document.getElementById('result').textContent=r.ok?'Mật khẩu đã được đặt lại.': 'Không thể đặt lại mật khẩu.';});</script></main></body></html>`;
}
