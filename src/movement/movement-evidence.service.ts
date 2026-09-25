import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CameraObservation } from '../monitoring/observation.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { Movement } from './entities/movement.entity.js';

/**
 * Leitura das fotos de evidência (movimento → observação → storage).
 */
@Injectable()
export class MovementEvidenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async findObservationPhotoPath(observationId: string): Promise<{ photoPath: string | null } | null> {
    const obs = await this.dataSource.getRepository(CameraObservation).findOneBy({ id: observationId });
    return obs ? { photoPath: obs.photoPath } : null;
  }

  /**
   * Recupera a foto de evidência de um movimento já resolvido no escopo do usuário.
   * Lança 404 quando o movimento não possui observação, não tem foto salva ou o
   * objeto não existe mais no armazenamento.
   */
  async loadEvidence(movement: Movement): Promise<{ buffer: Buffer; contentType: string }> {
    if (!movement.observationId) {
      throw new NotFoundException('Movimento não possui foto de evidência');
    }
    const observation = await this.dataSource
      .getRepository(CameraObservation)
      .findOneBy({ id: movement.observationId, companyId: movement.companyId });
    if (!observation?.photoPath) {
      throw new NotFoundException('Foto de evidência não disponível para este movimento');
    }
    try {
      const buffer = await this.storage.getEvidence(observation.photoPath);
      return { buffer, contentType: 'image/jpeg' };
    } catch {
      throw new NotFoundException('Foto de evidência não encontrada no armazenamento');
    }
  }
}
