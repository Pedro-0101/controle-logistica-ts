import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';

export function extractBearerToken(request: Request): string {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!token) {
    throw new UnauthorizedException('Token ausente ou inválido');
  }

  return token;
}

export function getTokenData(request: Request): AuthenticatedUser {
  const user = request.user as AuthenticatedUser | undefined;
  if (!user) {
    throw new UnauthorizedException('Usuário não autenticado');
  }
  return user;
}
