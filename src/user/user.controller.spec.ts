import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('UserController', () => {
  let controller: UserController;
  const service = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    linkPoints: vi.fn(),
    unlinkPoints: vi.fn(),
    getUserPoints: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: service }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delega ao service com dto e usuário', () => {
    const dto = { name: 'João', email: 'joao@empresa.com', password: 'senha' };
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
    const dto = { name: 'João Silva' };
    service.update.mockReturnValue({ id: '1' });

    expect(controller.update('1', dto as never, user)).toEqual({ id: '1' });
    expect(service.update).toHaveBeenCalledWith('1', dto, user);
  });

  it('remove delega ao service com id e usuário', () => {
    service.remove.mockReturnValue({ id: '1' });

    expect(controller.remove('1', user)).toEqual({ id: '1' });
    expect(service.remove).toHaveBeenCalledWith('1', user);
  });

  it('linkPoints delega ao service com id, dto e usuário', () => {
    const dto = { pointIds: ['p1', 'p2'] };
    service.linkPoints.mockReturnValue({ id: '1', points: [{ id: 'p1' }, { id: 'p2' }] });

    expect(controller.linkPoints('1', dto as never, user)).toEqual({
      id: '1',
      points: [{ id: 'p1' }, { id: 'p2' }],
    });
    expect(service.linkPoints).toHaveBeenCalledWith('1', dto, user);
  });

  it('unlinkPoints delega ao service com id, dto e usuário', () => {
    const dto = { pointIds: ['p1'] };
    service.unlinkPoints.mockReturnValue({ id: '1', points: [{ id: 'p2' }] });

    expect(controller.unlinkPoints('1', dto as never, user)).toEqual({
      id: '1',
      points: [{ id: 'p2' }],
    });
    expect(service.unlinkPoints).toHaveBeenCalledWith('1', dto, user);
  });

  it('getUserPoints delega ao service com id e usuário', () => {
    const points = [{ id: 'p1', name: 'Portão 1', code: 'P-001' }];
    service.getUserPoints.mockReturnValue(points);

    expect(controller.getUserPoints('1', user)).toEqual(points);
    expect(service.getUserPoints).toHaveBeenCalledWith('1', user);
  });
});
