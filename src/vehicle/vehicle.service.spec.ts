import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { VehicleService, normalizePlate } from './vehicle.service.js';
import { Vehicle } from './entities/vehicle.entity.js';
import type { Actor } from '../auth/company-scope.js';

const actor: Actor = {
  userId: 'u',
  email: 'u@test.com',
  role: 'admin',
  companyId: 'company-1',
};
const root = { ...actor, companyId: null };
function mockRepository() {
  const query = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({}),
  };
  return {
    create: vi.fn((v) => v),
    save: vi.fn(async (v) => v),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn(async (v) => v),
    createQueryBuilder: vi.fn(() => query),
    query,
  };
}
describe('VehicleService', () => {
  let repo: ReturnType<typeof mockRepository>;
  let service: VehicleService;
  beforeEach(() => {
    repo = mockRepository();
    service = new VehicleService(repo as unknown as Repository<Vehicle>);
  });
  it.each([
    [' abc-1234 ', 'ABC1234'],
    ['abc1d23', 'ABC1D23'],
    ['ABC1234', 'ABC1234'],
  ])('canonicalizes %s without guessing', (input, result) => {
    expect(normalizePlate(input)).toBe(result);
  });
  it.each(['4BC1234', 'ABC12', 'ABC1D234', 'ABC!1234', 'ABC 1234', ''])(
    'rejects invalid plate %s',
    (input) => {
      expect(() => normalizePlate(input)).toThrow(BadRequestException);
    },
  );
  it('creates canonical plates in actor company', async () => {
    await service.create({ plate: 'abc-1234', code: 'CUSTOM' } as never, actor);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: 'ABC1234',
        companyId: 'company-1',
        createdById: 'u',
      }),
    );
  });
  it('forbids root creation without company', () =>
    expect(() => service.create({ plate: 'ABC1234' } as never, root)).toThrow(
      ForbiddenException,
    ));
  it('lists company and root scopes', async () => {
    await service.findAll(actor);
    expect(repo.find).toHaveBeenLastCalledWith({
      where: { companyId: 'company-1' },
    });
    await service.findAll(root);
    expect(repo.find).toHaveBeenLastCalledWith({ where: undefined });
  });
  it('returns existing scoped vehicle without insertion', async () => {
    const existing = { id: 'v', plate: 'ABC1234', active: false };
    repo.findOneBy.mockResolvedValue(existing);
    expect(
      await service.findOrCreateByPlate('abc-1234', 'company-1', actor),
    ).toBe(existing);
    expect(repo.findOneBy).toHaveBeenCalledWith({
      plate: 'ABC1234',
      companyId: 'company-1',
    });
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('inserts a visitor and rereads scoped row', async () => {
    const created = { id: 'v', plate: 'ABC1234' };
    repo.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(created);
    expect(
      await service.findOrCreateByPlate('ABC1234', 'company-1', actor),
    ).toBe(created);
    expect(repo.query.values).toHaveBeenCalledWith({
      plate: 'ABC1234',
      code: 'ABC1234',
      type: 'visitor',
      active: true,
      companyId: 'company-1',
      createdById: 'u',
    });
    expect(repo.query.orIgnore).toHaveBeenCalled();
    expect(repo.findOneBy).toHaveBeenNthCalledWith(2, {
      plate: 'ABC1234',
      companyId: 'company-1',
    });
  });
  it('concurrent misses return the winner without overwriting its metadata', async () => {
    const winner = {
      id: 'winner',
      plate: 'ABC1234',
      code: 'CUSTOM',
      type: 'own',
      active: false,
    };
    repo.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(winner);
    const results = await Promise.all([
      service.findOrCreateByPlate('ABC1234', 'company-1', actor),
      service.findOrCreateByPlate('ABC1234', 'company-1', actor),
    ]);
    expect(results).toEqual([winner, winner]);
    expect(repo.query.orIgnore).toHaveBeenCalledTimes(2);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('does not return another vehicle when code conflict prevents insertion', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(
      service.findOrCreateByPlate('ABC1234', 'company-1', actor),
    ).rejects.toThrow(ConflictException);
  });
  it.each(['', 'other-company'])(
    'rejects invalid operation company %s before DB work',
    async (company) => {
      await expect(
        service.findOrCreateByPlate('ABC1234', company, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.findOneBy).not.toHaveBeenCalled();
    },
  );
  it('allows explicit company for root and uses transaction repository exclusively', async () => {
    const transactional = mockRepository();
    transactional.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'tx' });
    const manager = { getRepository: vi.fn(() => transactional) };
    expect(
      await service.findOrCreateByPlate(
        'ABC1234',
        'company-2',
        root,
        manager as unknown as EntityManager,
      ),
    ).toEqual({ id: 'tx' });
    expect(manager.getRepository).toHaveBeenCalledWith(Vehicle);
    expect(repo.findOneBy).not.toHaveBeenCalled();
    expect(transactional.findOneBy).toHaveBeenLastCalledWith({
      plate: 'ABC1234',
      companyId: 'company-2',
    });
  });
  it('propagates database failures without false success', async () => {
    repo.findOneBy.mockResolvedValue(null);
    repo.query.execute.mockRejectedValue(new Error('db failure'));
    await expect(
      service.findOrCreateByPlate('ABC1234', 'company-1', actor),
    ).rejects.toThrow('db failure');
  });
  it('finds scoped rows and rejects missing rows', async () => {
    repo.findOneBy
      .mockResolvedValueOnce({ id: 'v' })
      .mockResolvedValueOnce(null);
    expect(await service.findOne('v', actor)).toEqual({ id: 'v' });
    expect(repo.findOneBy).toHaveBeenCalledWith({
      id: 'v',
      companyId: 'company-1',
    });
    await expect(service.findOne('missing', root)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('normalizes updated plate and preserves plate on other edits', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 'v',
      plate: 'ABC1234',
      companyId: 'company-1',
    });
    await service.update('v', { plate: ' abc1d23 ' } as never, actor);
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ plate: 'ABC1D23', updatedById: 'u' }),
    );
    await service.update('v', { active: false } as never, actor);
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ plate: 'ABC1D23', active: false }),
    );
  });
  it('rejects invalid update without saving', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'v', plate: 'ABC1234' });
    await expect(
      service.update('v', { plate: '4BC1234' } as never, actor),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('removes scoped vehicle and rejects missing', async () => {
    repo.findOneBy
      .mockResolvedValueOnce({ id: 'v' })
      .mockResolvedValueOnce(null);
    await service.remove('v', actor);
    expect(repo.remove).toHaveBeenCalledWith({ id: 'v' });
    await expect(service.remove('missing', actor)).rejects.toThrow(
      NotFoundException,
    );
  });
});
