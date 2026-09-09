import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CameraService } from './camera.service.js';
import { Camera } from './entities/camera.entity.js';
import type { Actor } from '../auth/company-scope.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('CameraService', () => {
  let service: CameraService;
  const repository = {
    create: vi.fn((data: Partial<Camera>) => data),
    save: vi.fn((data: Partial<Camera>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Camera>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CameraService,
        {
          provide: getRepositoryToken(Camera),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<CameraService>(CameraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('usuário comum deve filtrar câmeras pela própria empresa', async () => {
    repository.find.mockResolvedValue([{ id: '1' }]);
    await service.findAll(companyActor);
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
    });
  });
});
