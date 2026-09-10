import { ForbiddenException } from '@nestjs/common';
import type { FindOptionsWhere } from 'typeorm';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';

export type Actor = AuthenticatedUser;

export type CompanyScope =
  | { mode: 'all'; companyId: null }
  | { mode: 'company'; companyId: string };

export function resolveCompanyScope(actor: Actor): CompanyScope {
  if (!actor.companyId) {
    return { mode: 'all', companyId: null };
  }
  return { mode: 'company', companyId: actor.companyId };
}

export function requireCompanyId(actor: Actor): string {
  const scope = resolveCompanyScope(actor);
  if (scope.mode !== 'company' || !scope.companyId) {
    throw new ForbiddenException(
      'É necessário estar vinculado a uma empresa para realizar esta operação',
    );
  }
  return scope.companyId;
}

export function companyScopeFilter<T extends object>(
  scope: CompanyScope,
  field: string = 'companyId',
): FindOptionsWhere<T> | undefined {
  if (scope.mode === 'all') {
    return undefined;
  }
  return { [field]: scope.companyId } as FindOptionsWhere<T>;
}

export function withCompanyScopeWhere<T extends object>(
  base: FindOptionsWhere<T>,
  scope: CompanyScope,
  field: string = 'companyId',
): FindOptionsWhere<T> {
  const filter = companyScopeFilter<T>(scope, field);
  return filter ? { ...base, ...filter } : base;
}
