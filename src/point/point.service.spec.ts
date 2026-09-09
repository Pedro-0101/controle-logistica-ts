import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PointService } from './point.service.js';
import { Point } from './entities/point.entity.js';
import type { Actor } from '../auth/company-scope.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('PointService', () => {
  let service: PointService;
  const repository = {
    create: vi.fn((data: Partial<Point>) => data),
    save: vi.fn((data: Partial<Point>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Point>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        {
          provide: getRepositoryToken(Point),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<PointService>(PointService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('usuário comum deve filtrar pontos pela própria empresa', async () => {
    repository.find.mockResolvedValue([{ id: '1' }]);
    await service.findAll(companyActor);
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
    });
  });
});
