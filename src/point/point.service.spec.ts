import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { PointService } from './point.service.js';
import { Point } from './entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import type { Actor } from '../auth/company-scope.js';
const actor: Actor = {
  userId: 'u',
  email: 'u@test.com',
  role: 'admin',
  companyId: 'company-1',
};
const root = { ...actor, companyId: null };
const context = {
  id: 'point',
  adminUnityId: 'unit-1',
  companyId: 'company-1',
  type: 'entry',
  name: 'Point',
};
function mockRepository() {
  return {
    create: vi.fn((v) => v),
    save: vi.fn(async (v) => v),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn(async (v) => v),
  };
}
describe('PointService', () => {
  let repo: ReturnType<typeof mockRepository>;
  let units: ReturnType<typeof mockRepository>;
  let service: PointService;
  beforeEach(() => {
    repo = mockRepository();
    units = mockRepository();
    repo.findOneBy.mockResolvedValue({ ...context });
    units.findOneBy.mockResolvedValue({
      id: 'unit-1',
      companyId: 'company-1',
      active: true,
    });
    service = new PointService(
      repo as unknown as Repository<Point>,
      units as unknown as Repository<AdminUnity>,
    );
  });
  it('creates with validated company unit and actor', async () => {
    await service.create(
      { adminUnityId: 'unit-1', name: 'Point', type: 'entry' } as never,
      actor,
    );
    expect(units.findOneBy).toHaveBeenCalledWith({
      id: 'unit-1',
      companyId: 'company-1',
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        createdById: 'u',
        type: 'entry',
      }),
    );
  });
  it('rejects companyless creation', async () => {
    await expect(service.create(context as never, root)).rejects.toThrow(
      ForbiddenException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects nonexistent or foreign-company unit via scoped lookup', async () => {
    units.findOneBy.mockResolvedValue(null);
    await expect(service.create(context as never, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('permits administration of inactive units', async () => {
    units.findOneBy.mockResolvedValue({ id: 'unit-1', active: false });
    await service.create(context as never, actor);
    expect(repo.save).toHaveBeenCalled();
  });
  it('lists company and root scope', async () => {
    await service.findAll(actor);
    expect(repo.find).toHaveBeenLastCalledWith({
      where: { companyId: 'company-1' },
    });
    await service.findAll(root);
    expect(repo.find).toHaveBeenLastCalledWith({ where: undefined });
  });
  it('finds tenant point and rejects missing', async () => {
    expect(await service.findOne('point', actor)).toEqual(context);
    expect(repo.findOneBy).toHaveBeenCalledWith({
      id: 'point',
      companyId: 'company-1',
    });
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne('missing', root)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('updates ordinary fields and validates stored unit', async () => {
    await service.update(
      'point',
      { name: 'Rename', active: false } as never,
      actor,
    );
    expect(repo.save).toHaveBeenCalledWith({
      ...context,
      name: 'Rename',
      active: false,
      updatedById: 'u',
    });
    expect(units.findOneBy).toHaveBeenCalledWith({
      id: 'unit-1',
      companyId: 'company-1',
    });
  });
  it('accepts explicitly unchanged context during root edit', async () => {
    await service.update(
      'point',
      { adminUnityId: 'unit-1', type: 'entry' } as never,
      root,
    );
    expect(repo.save).toHaveBeenCalled();
    expect(units.findOneBy).toHaveBeenCalledWith({
      id: 'unit-1',
      companyId: 'company-1',
    });
  });
  it.each([{ adminUnityId: 'unit-2' }])(
    'rejects context reassignment %j',
    async (update) => {
      await expect(
        service.update('point', update as never, actor),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
  it('permite alterar o tipo (entry/exit/both) do ponto', async () => {
    await service.update('point', { type: 'exit' } as never, actor);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exit', updatedById: 'u' }),
    );
  });
  it('rejects editing corrupted or deleted unit context', async () => {
    units.findOneBy.mockResolvedValue(null);
    await expect(
      service.update('point', { name: 'Rename' } as never, actor),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('removes found point and rejects missing', async () => {
    await service.remove('point', actor);
    expect(repo.remove).toHaveBeenCalledWith(context);
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.remove('missing', actor)).rejects.toThrow(
      NotFoundException,
    );
  });
});
