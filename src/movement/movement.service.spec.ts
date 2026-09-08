import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MovementService } from './movement.service.js';
import { Movement } from './entities/movement.entity.js';
import type { Actor } from '../auth/company-scope.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('MovementService', () => {
  let service: MovementService;
  const repository = {
    create: vi.fn((data: Partial<Movement>) => data),
    save: vi.fn((data: Partial<Movement>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Movement>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementService,
        {
          provide: getRepositoryToken(Movement),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<MovementService>(MovementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('usuário comum deve filtrar movimentos pela própria empresa', async () => {
    repository.find.mockResolvedValue([{ id: '1' }]);
    await service.findAll(companyActor);
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
    });
  });
});
