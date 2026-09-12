import { Test, TestingModule } from '@nestjs/testing';
import { CompanyConfigController } from './company-config.controller.js';
import { CompanyConfigService } from './company-config.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('CompanyConfigController', () => {
  let controller: CompanyConfigController;
  const service = {
    findOne: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyConfigController],
      providers: [{ provide: CompanyConfigService, useValue: service }],
    }).compile();

    controller = module.get<CompanyConfigController>(CompanyConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findOne delega ao service com companyId e usuário', () => {
    service.findOne.mockReturnValue({ id: 'config-1', companyId: 'company-1' });

    expect(controller.findOne('company-1', user)).toEqual({
      id: 'config-1',
      companyId: 'company-1',
    });
    expect(service.findOne).toHaveBeenCalledWith('company-1', user);
  });

  it('update delega ao service com companyId, dto e usuário', () => {
    const dto = { timezone: 'America/New_York' };
    service.update.mockReturnValue({ id: 'config-1', companyId: 'company-1' });

    expect(controller.update('company-1', dto as never, user)).toEqual({
      id: 'config-1',
      companyId: 'company-1',
    });
    expect(service.update).toHaveBeenCalledWith('company-1', dto, user);
  });
});
