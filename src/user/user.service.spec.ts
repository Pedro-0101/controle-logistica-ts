import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { User } from './entities/user.entity.js';
import { Point } from '../point/entities/point.entity.js';
import type { Actor } from '../auth/company-scope.js';

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

describe('UserService', () => {
  let service: UserService;
  const repository = {
    create: vi.fn((data: Partial<User>) => data),
    save: vi.fn((data: Partial<User>) => data),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<User>) => data),
  };
  const pointRepository = {
    findBy: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
        {
          provide: getRepositoryToken(Point),
          useValue: pointRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('root deve listar todos os usuários (sem filtro de empresa)', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(rootActor);
      expect(repository.find).toHaveBeenCalledWith({ where: undefined });
    });

    it('usuário comum deve filtrar pela própria empresa', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(companyActor);
      expect(repository.find).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
      });
    });
  });

  describe('findOne', () => {
    it('usuário comum deve buscar com filtro de empresa', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.findOne('1', companyActor);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: '1',
        companyId: 'company-1',
      });
    });

    it('deve lançar 404 quando não encontra o usuário no escopo', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', async () => {
      await service.create(
        {
          name: 'João',
          email: 'joao@empresa.com',
          password: 'senha123',
          role: 'user',
        },
        companyActor,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1' }),
      );
    });

    it('root cria usuário sem empresa vinculada (companyId null)', async () => {
      await service.create(
        {
          name: 'João',
          email: 'joao@empresa.com',
          password: 'senha123',
          role: 'user',
        },
        rootActor,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: null }),
      );
    });

    it('não permite criar um segundo admin para a mesma empresa', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'admin-1' });
      await expect(
        service.create(
          {
            name: 'João',
            email: 'joao@empresa.com',
            password: 'senha123',
            role: 'admin',
          },
          companyActor,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('não permite rebaixar o administrador da empresa', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'admin',
        companyId: 'company-1',
      });
      await expect(
        service.update('1', { role: 'user' }, rootActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('não permite promover usuário quando a empresa já tem admin', async () => {
      repository.findOneBy
        .mockResolvedValueOnce({
          id: '1',
          role: 'user',
          companyId: 'empresa-x',
        })
        .mockResolvedValueOnce({ id: 'admin-1' });
      await expect(
        service.update('1', { role: 'admin' }, rootActor),
      ).rejects.toThrow(ConflictException);
    });

    it('deve atualizar dados e salvar', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'user',
        companyId: 'company-1',
      });
      await service.update('1', { name: 'João Silva' }, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', name: 'João Silva' }),
      );
    });

    it('deve re-hash da senha ao atualizá-la', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'user',
        companyId: 'company-1',
      });
      const hashSpy = vi
        .spyOn(service, 'hashPassword')
        .mockResolvedValue('senha-hash');

      await service.update('1', { password: 'nova-senha' }, companyActor);

      expect(hashSpy).toHaveBeenCalledWith('nova-senha');
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'senha-hash' }),
      );
    });
  });

  describe('findByEmail', () => {
    it('deve buscar usuário pelo email', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1', email: 'a@b.com' });

      await expect(service.findByEmail('a@b.com')).resolves.toEqual({
        id: '1',
        email: 'a@b.com',
      });
      expect(repository.findOneBy).toHaveBeenCalledWith({ email: 'a@b.com' });
    });
  });

  describe('remove', () => {
    it('não permite remover usuário administrador', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1', role: 'admin' });
      await expect(service.remove('1', rootActor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve remover usuário não-administrador', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'user',
        companyId: 'company-1',
      });
      await service.remove('1', companyActor);

      expect(repository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', role: 'user' }),
      );
    });
  });

  describe('linkPoints', () => {
    it('usuário comum não pode vincular pontos', async () => {
      const userActor: Actor = {
        userId: 'user-id',
        email: 'user@empresa.com',
        role: 'user',
        companyId: 'company-1',
      };
      await expect(
        service.linkPoints('1', { pointIds: ['p1'] }, userActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('não permite vincular pontos a usuário que não é do tipo "user"', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'admin',
        companyId: 'company-1',
        points: [],
      });
      await expect(
        service.linkPoints('1', { pointIds: ['p1'] }, companyActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve vincular pontos ao usuário', async () => {
      const userWithPoints = {
        id: '1',
        role: 'user',
        companyId: 'company-1',
        points: [],
      };
      repository.findOneBy.mockResolvedValue(userWithPoints);
      repository.save.mockResolvedValue(userWithPoints);
      pointRepository.findBy.mockResolvedValue([
        { id: 'p1', companyId: 'company-1' },
      ]);

      await service.linkPoints('1', { pointIds: ['p1'] }, companyActor);

      expect(repository.save).toHaveBeenCalled();
      expect(pointRepository.findBy).toHaveBeenCalled();
    });

    it('deve lançar 404 quando ponto não existe', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'user',
        companyId: 'company-1',
        points: [],
      });
      pointRepository.findBy.mockResolvedValue([]);

      await expect(
        service.linkPoints('1', { pointIds: ['p1'] }, companyActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('não permite vincular pontos de outra empresa', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        role: 'user',
        companyId: 'company-1',
        points: [],
      });
      pointRepository.findBy.mockResolvedValue([
        { id: 'p1', companyId: 'company-2' },
      ]);

      await expect(
        service.linkPoints('1', { pointIds: ['p1'] }, companyActor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unlinkPoints', () => {
    it('usuário comum não pode desvincular pontos', async () => {
      const userActor: Actor = {
        userId: 'user-id',
        email: 'user@empresa.com',
        role: 'user',
        companyId: 'company-1',
      };
      await expect(
        service.unlinkPoints('1', { pointIds: ['p1'] }, userActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve desvincular pontos do usuário', async () => {
      const userWithPoints = {
        id: '1',
        role: 'user',
        companyId: 'company-1',
        points: [Object.assign(new Point(), { id: 'p1' }), Object.assign(new Point(), { id: 'p2' })],
      };
      repository.findOneBy.mockResolvedValue(userWithPoints);
      repository.save.mockResolvedValue(userWithPoints);

      await service.unlinkPoints('1', { pointIds: ['p1'] }, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          points: [{ id: 'p2' }],
        }),
      );
    });

    it('deve retornar usuário quando não tem pontos vinculados', async () => {
      const userWithoutPoints = {
        id: '1',
        role: 'user',
        companyId: 'company-1',
        points: [],
      };
      repository.findOneBy.mockResolvedValue(userWithoutPoints);

      const result = await service.unlinkPoints(
        '1',
        { pointIds: ['p1'] },
        companyActor,
      );

      expect(repository.save).not.toHaveBeenCalled();
      expect(result).toEqual(userWithoutPoints);
    });
  });

  describe('getUserPoints', () => {
    it('deve retornar os pontos vinculados ao usuário', async () => {
      const points = [{ id: 'p1', name: 'Portão 1', code: 'P-001' }];
      repository.findOne.mockResolvedValue({
        id: '1',
        points,
      });

      const result = await service.getUserPoints('1', companyActor);

      expect(result).toEqual(points);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '1', companyId: 'company-1' },
        relations: { points: true },
      });
    });

    it('deve lançar 404 quando usuário não existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.getUserPoints('1', companyActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve retornar array vazio quando usuário não tem pontos', async () => {
      repository.findOne.mockResolvedValue({
        id: '1',
        points: null,
      });

      const result = await service.getUserPoints('1', companyActor);

      expect(result).toEqual([]);
    });
  });
});
