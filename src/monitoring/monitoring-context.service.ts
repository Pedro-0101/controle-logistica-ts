import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../camera/entities/camera.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';

/**
 * Validação de contexto de câmera (ponto e unidade ativos e consistentes).
 * Compartilhada entre o ciclo de vida de observação e a sincronização de monitores.
 */
@Injectable()
export class MonitoringContextService {
  constructor(
    @InjectRepository(Point) private readonly points: Repository<Point>,
    @InjectRepository(AdminUnity) private readonly units: Repository<AdminUnity>,
  ) {}

  async validContext(camera: Camera): Promise<boolean> {
    const [point, unit] = await Promise.all([
      this.points.findOneBy({ id: camera.pointId, companyId: camera.companyId, active: true }),
      this.units.findOneBy({ id: camera.adminUnityId, companyId: camera.companyId, active: true }),
    ]);
    return !!point && !!unit && point.adminUnityId === unit.id;
  }
}
