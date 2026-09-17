import { Test, TestingModule } from '@nestjs/testing';
import { MovementController } from './movement.controller.js';
import { MovementService } from './movement.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('MovementController', () => {
  let controller: MovementController;
  const service = {
    create: vi.fn(),
    createFromCamera: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    discard: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovementController],
      providers: [{ provide: MovementService, useValue: service }],
    }).compile();

    controller = module.get<MovementController>(MovementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delega ao service com dto e usuário', () => {
    const dto = { vehicleId: 'v-1', type: 'entry' };
    service.create.mockReturnValue({ id: '1' });

    expect(controller.create(dto as never, user)).toEqual({ id: '1' });
    expect(service.create).toHaveBeenCalledWith(dto, user);
  });

  it('createFromCamera delega ao service com dto e usuário', () => {
    const dto = { cameraId: 'camera-1' };
    service.createFromCamera.mockReturnValue({
      movement: { id: '1' },
      vehicle: { id: 'v-1' },
    });

    expect(controller.createFromCamera(dto as never, user)).toEqual({
      movement: { id: '1' },
      vehicle: { id: 'v-1' },
    });
    expect(service.createFromCamera).toHaveBeenCalledWith(dto, user);
  });

  it('findAll delega ao service com filtros e usuário', () => {
    const filters = { page: 1, limit: 20, orderBy: 'dateTime' as const, order: 'DESC' as const };
    service.findAll.mockReturnValue({ data: [{ id: '1' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });

    expect(controller.findAll(filters as never, user)).toEqual({ data: [{ id: '1' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    expect(service.findAll).toHaveBeenCalledWith(user, filters);
  });

  it('findOne delega ao service com id e usuário', () => {
    service.findOne.mockReturnValue({ id: '1' });

    expect(controller.findOne('1', user)).toEqual({ id: '1' });
    expect(service.findOne).toHaveBeenCalledWith('1', user);
  });

  it('update delega ao service com id, dto e usuário', () => {
    const dto = { type: 'exit' };
    service.update.mockReturnValue({ id: '1' });

    expect(controller.update('1', dto as never, user)).toEqual({ id: '1' });
    expect(service.update).toHaveBeenCalledWith('1', dto, user);
  });

  it('remove delega ao service com id e usuário', () => {
    service.remove.mockReturnValue({ id: '1' });

    expect(controller.remove('1', user)).toEqual({ id: '1' });
    expect(service.remove).toHaveBeenCalledWith('1', user);
  });

  it('discard delega ao service com os ids e usuário', () => {
    service.discard.mockReturnValue([{ id: '1', status: 'discarded' }]);

    expect(controller.discard({ ids: ['1', '2'] }, user)).toEqual([{ id: '1', status: 'discarded' }]);
    expect(service.discard).toHaveBeenCalledWith(['1', '2'], user);
  });
});
