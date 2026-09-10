import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { User } from './entities/user.entity.js';
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
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<User>) => data),
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
});
