import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodResponse, ZodValidationPipe } from 'zod-nest';
import { AuthService, type SafeUser } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.schema.js';
import { LoginResponseDto } from './dto/login-response.schema.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autenticar usuário',
    description:
      'Autentica com email e senha e retorna um token JWT para uso como Bearer token.',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciais inválidas',
  })
  @ZodResponse({ status: 200, type: LoginResponseDto })
  login(
    @Body(new ZodValidationPipe(LoginDto)) _loginDto: LoginDto,
    @Req() req: Request,
  ) {
    return this.authService.login(req.user as SafeUser);
  }
}
