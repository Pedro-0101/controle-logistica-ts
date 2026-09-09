import { Test, TestingModule } from '@nestjs/testing';
import { CameraController } from './camera.controller.js';
import { CameraService } from './camera.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('CameraController', () => {
  let controller: CameraController;
  const service = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CameraController],
      providers: [{ provide: CameraService, useValue: service }],
    }).compile();

    controller = module.get<CameraController>(CameraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delega ao service com dto e usuário', () => {
    const dto = { name: 'Portaria 1' };
    service.create.mockReturnValue({ id: '1' });

    expect(controller.create(dto as never, user)).toEqual({ id: '1' });
    expect(service.create).toHaveBeenCalledWith(dto, user);
  });

  it('findAll delega ao service com o usuário', () => {
    service.findAll.mockReturnValue([{ id: '1' }]);

    expect(controller.findAll(user)).toEqual([{ id: '1' }]);
    expect(service.findAll).toHaveBeenCalledWith(user);
  });

  it('findOne delega ao service com id e usuário', () => {
    service.findOne.mockReturnValue({ id: '1' });

    expect(controller.findOne('1', user)).toEqual({ id: '1' });
    expect(service.findOne).toHaveBeenCalledWith('1', user);
  });

  it('update delega ao service com id, dto e usuário', () => {
    const dto = { name: 'Portaria 2' };
    service.update.mockReturnValue({ id: '1' });

    expect(controller.update('1', dto as never, user)).toEqual({ id: '1' });
    expect(service.update).toHaveBeenCalledWith('1', dto, user);
  });

  it('remove delega ao service com id e usuário', () => {
    service.remove.mockReturnValue({ id: '1' });

    expect(controller.remove('1', user)).toEqual({ id: '1' });
    expect(service.remove).toHaveBeenCalledWith('1', user);
  });
});
