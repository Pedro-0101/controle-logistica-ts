import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VehicleService } from './vehicle.service.js';
import { Vehicle } from './entities/vehicle.entity.js';
import type { Actor } from '../auth/company-scope.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('VehicleService', () => {
  let service: VehicleService;
  const repository = {
    create: vi.fn((data: Partial<Vehicle>) => data),
    save: vi.fn((data: Partial<Vehicle>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Vehicle>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        {
          provide: getRepositoryToken(Vehicle),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<VehicleService>(VehicleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('usuário comum deve filtrar veículos pela própria empresa', async () => {
    repository.find.mockResolvedValue([{ id: '1' }]);
    await service.findAll(companyActor);
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
    });
  });
});
