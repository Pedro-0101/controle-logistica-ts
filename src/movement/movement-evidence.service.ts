import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { CameraObservation } from '../monitoring/observation.entity.js';
import { StorageService } from '../storage/storage.service.js';
import { Movement } from './entities/movement.entity.js';

/**
 * Leitura e descarte das fotos de evidência (movimento → observação → storage).
 *
 * As fotos existem apenas enquanto a leitura aguarda revisão; ao confirmar ou
 * descartar a ocorrência elas são removidas do storage para não acumular lixo.
 */
@Injectable()
export class MovementEvidenceService {
  private readonly logger = new Logger(MovementEvidenceService.name);

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

  /**
   * Remove do storage as fotos de evidência das observações informadas e limpa o
   * `photoPath` correspondente.
   *
   * Chamado após a confirmação/descarte de movimentos automáticos: a foto só é
   * necessária enquanto a leitura aguarda revisão. Falhas são registradas e não
   * propagadas — a resolução do movimento já foi persistida.
   */
  async removeEvidenceForObservations(observationIds: Array<string | null>): Promise<void> {
    const ids = [...new Set(observationIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return;

    const repository = this.dataSource.getRepository(CameraObservation);
    const observations = await repository.find({ where: { id: In(ids) } });
    const withPhoto = observations.filter((observation) => !!observation.photoPath);
    if (withPhoto.length === 0) return;

    await Promise.all(
      withPhoto.map(async (observation) => {
        try {
          await this.storage.removeEvidence(observation.photoPath!);
        } catch (error) {
          this.logger.warn(
            `Falha ao remover foto de evidência ${observation.photoPath}: ${String(error)}`,
          );
        }
        observation.photoPath = null;
      }),
    );

    await repository.save(withPhoto);
  }
}
