import { ForbiddenException } from '@nestjs/common';
import {
  companyScopeFilter,
  requireCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
  type Actor,
  type CompanyScope,
} from './company-scope.js';

const rootActor: Actor = {
  userId: 'root-id',
  email: 'root@sistema.com',
  role: 'admin',
  companyId: null,
};

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('resolveCompanyScope', () => {
  it('ator sem empresa resolve escopo "all"', () => {
    expect(resolveCompanyScope(rootActor)).toEqual({
      mode: 'all',
      companyId: null,
    });
  });

  it('ator com empresa resolve escopo "company"', () => {
    expect(resolveCompanyScope(companyActor)).toEqual({
      mode: 'company',
      companyId: 'company-1',
    });
  });
});

describe('companyScopeFilter', () => {
  it('escopo "all" retorna filtro indefinido (sem restrição)', () => {
    const scope: CompanyScope = { mode: 'all', companyId: null };
    expect(companyScopeFilter(scope)).toBeUndefined();
  });

  it('escopo "company" filtra por companyId por padrão', () => {
    const scope: CompanyScope = { mode: 'company', companyId: 'company-1' };
    expect(companyScopeFilter(scope)).toEqual({ companyId: 'company-1' });
  });

  it('permite campo de filtro customizado', () => {
    const scope: CompanyScope = { mode: 'company', companyId: 'company-1' };
    expect(companyScopeFilter(scope, 'tenantId')).toEqual({
      tenantId: 'company-1',
    });
  });
});

describe('requireCompanyId', () => {
  it('ator com empresa retorna o companyId do token', () => {
    expect(requireCompanyId(companyActor)).toBe('company-1');
  });

  it('ator sem empresa lança ForbiddenException', () => {
    expect(() => requireCompanyId(rootActor)).toThrow(ForbiddenException);
  });
});

describe('withCompanyScopeWhere', () => {
  it('escopo "all" mantém apenas o filtro base', () => {
    const scope: CompanyScope = { mode: 'all', companyId: null };
    expect(withCompanyScopeWhere({ id: '1' }, scope)).toEqual({ id: '1' });
  });

  it('escopo "company" mescla o filtro de empresa ao filtro base', () => {
    const scope: CompanyScope = { mode: 'company', companyId: 'company-1' };
    expect(withCompanyScopeWhere({ id: '1' }, scope)).toEqual({
      id: '1',
      companyId: 'company-1',
    });
  });
});
