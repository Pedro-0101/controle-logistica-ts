import {
  companyScopeFilter,
  forceCompanyId,
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

describe('forceCompanyId', () => {
  it('escopo "all" mantém os dados originais', () => {
    const scope: CompanyScope = { mode: 'all', companyId: null };
    const data = { name: 'X', companyId: 'outra' };
    expect(forceCompanyId(data, scope)).toBe(data);
  });

  it('escopo "company" força o companyId do ator', () => {
    const scope: CompanyScope = { mode: 'company', companyId: 'company-1' };
    const data = { name: 'X', companyId: 'outra-empresa' };
    const result = forceCompanyId(data, scope);
    expect(result).toEqual({ name: 'X', companyId: 'company-1' });
    expect(result).not.toBe(data);
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
