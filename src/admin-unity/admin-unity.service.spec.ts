import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminUnityService } from './admin-unity.service.js';
import { AdminUnity } from './entities/admin-unity.entity.js';
import type { Actor } from '../auth/company-scope.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('AdminUnityService', () => {
  let service: AdminUnityService;
  const repository = {
    create: vi.fn((data: Partial<AdminUnity>) => data),
    save: vi.fn((data: Partial<AdminUnity>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<AdminUnity>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUnityService,
        {
          provide: getRepositoryToken(AdminUnity),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<AdminUnityService>(AdminUnityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('usuário comum deve filtrar unidades pela própria empresa', async () => {
    repository.find.mockResolvedValue([{ id: '1' }]);
    await service.findAll(companyActor);
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
    });
  });
});
