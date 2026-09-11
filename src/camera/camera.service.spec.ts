import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CameraService } from './camera.service.js';
import { Camera } from './entities/camera.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { MediaMTXService } from './mediamtx.service.js';
import type { Actor } from '../auth/company-scope.js';
const actor: Actor = {
  userId: 'u',
  email: 'u@test.com',
  role: 'admin',
  companyId: 'company-1',
};
const root = { ...actor, companyId: null };
const context = {
  id: 'camera',
  companyId: 'company-1',
  adminUnityId: 'unit-1',
  pointId: 'point-1',
  name: 'Camera',
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
describe('CameraService', () => {
  let repo: ReturnType<typeof mockRepository>;
  let units: ReturnType<typeof mockRepository>;
  let points: ReturnType<typeof mockRepository>;
  let mediamtx: MediaMTXService;
  let service: CameraService;
  beforeEach(() => {
    repo = mockRepository();
    units = mockRepository();
    points = mockRepository();
    mediamtx = {
      addPath: vi.fn(),
      removePath: vi.fn(),
      pathExists: vi.fn(),
      listPaths: vi.fn(),
      getStreamUrls: vi.fn(() => ({
        hlsUrl: 'http://localhost:8888/test/index.m3u8',
        webrtcUrl: 'http://localhost:8889/test',
        rtspUrl: 'rtsp://localhost:8554/test',
      })),
    } as unknown as MediaMTXService;
    repo.findOneBy.mockResolvedValue({ ...context });
    units.findOneBy.mockResolvedValue({
      id: 'unit-1',
      companyId: 'company-1',
      active: true,
    });
    points.findOneBy.mockResolvedValue({
      id: 'point-1',
      adminUnityId: 'unit-1',
      companyId: 'company-1',
      active: true,
    });
    service = new CameraService(
      repo as unknown as Repository<Camera>,
      units as unknown as Repository<AdminUnity>,
      points as unknown as Repository<Point>,
      mediamtx,
    );
  });
  it('creates with scoped unit and point and stamps actor', async () => {
    await service.create(
      { adminUnityId: 'unit-1', pointId: 'point-1', name: 'Camera' } as never,
      actor,
    );
    expect(units.findOneBy).toHaveBeenCalledWith({
      id: 'unit-1',
      companyId: 'company-1',
    });
    expect(points.findOneBy).toHaveBeenCalledWith({
      id: 'point-1',
      companyId: 'company-1',
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        createdById: 'u',
        pointId: 'point-1',
      }),
    );
  });
  it('rejects companyless creation', async () => {
    await expect(service.create(context as never, root)).rejects.toThrow(
      ForbiddenException,
    );
    expect(units.findOneBy).not.toHaveBeenCalled();
  });
  it('rejects missing or foreign-company unit via scoped lookup', async () => {
    units.findOneBy.mockResolvedValue(null);
    await expect(service.create(context as never, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(points.findOneBy).not.toHaveBeenCalled();
  });
  it('rejects missing or foreign-company point via scoped lookup', async () => {
    points.findOneBy.mockResolvedValue(null);
    await expect(service.create(context as never, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('rejects point belonging to another unit in same company', async () => {
    points.findOneBy.mockResolvedValue({ adminUnityId: 'unit-2' });
    await expect(service.create(context as never, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('permits administrative registration under inactive context', async () => {
    units.findOneBy.mockResolvedValue({ id: 'unit-1', active: false });
    points.findOneBy.mockResolvedValue({
      adminUnityId: 'unit-1',
      active: false,
    });
    await service.create(context as never, actor);
    expect(repo.save).toHaveBeenCalled();
  });
  it('lists tenant scoped and root results', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAll(actor);
    expect(repo.find).toHaveBeenLastCalledWith({
      where: { companyId: 'company-1' },
    });
    await service.findAll(root);
    expect(repo.find).toHaveBeenLastCalledWith({ where: undefined });
  });
  it('finds with company scope and rejects missing', async () => {
    const result = await service.findOne('camera', actor);
    expect(result).toEqual({
      ...context,
      streamUrls: {
        hlsUrl: 'http://localhost:8888/test/index.m3u8',
        webrtcUrl: 'http://localhost:8889/test',
        rtspUrl: 'rtsp://localhost:8554/test',
      },
    });
    expect(repo.findOneBy).toHaveBeenCalledWith({
      id: 'camera',
      companyId: 'company-1',
    });
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne('missing', root)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('updates ordinary fields and validates existing context', async () => {
    await service.update('camera', { name: 'Renamed' } as never, actor);
    expect(repo.save).toHaveBeenCalledWith({
      ...context,
      name: 'Renamed',
      updatedById: 'u',
    });
    expect(units.findOneBy).toHaveBeenCalledWith({
      id: 'unit-1',
      companyId: 'company-1',
    });
  });
  it('accepts explicit unchanged unit and point including root edit', async () => {
    await service.update(
      'camera',
      { adminUnityId: 'unit-1', pointId: 'point-1' } as never,
      root,
    );
    expect(repo.save).toHaveBeenCalled();
    expect(points.findOneBy).toHaveBeenCalledWith({
      id: 'point-1',
      companyId: 'company-1',
    });
  });
  it.each([{ adminUnityId: 'unit-2' }, { pointId: 'point-2' }])(
    'rejects reassignment %j',
    async (update) => {
      await expect(
        service.update('camera', update as never, actor),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
  it('rejects edits if stored context is invalid', async () => {
    units.findOneBy.mockResolvedValue(null);
    await expect(
      service.update('camera', { name: 'Rename' } as never, actor),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('removes found camera and rejects missing', async () => {
    await service.remove('camera', actor);
    expect(repo.remove).toHaveBeenCalledWith(context);
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.remove('missing', actor)).rejects.toThrow(
      NotFoundException,
    );
  });
});
