import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnprService } from '../anpr/anpr.service.js';
import { StorageService } from '../storage/storage.service.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { CameraObservation } from '../monitoring/observation.entity.js';

/**
 * Persistência da foto de evidência de placas não cadastradas.
 */
@Injectable()
export class AutoRegistrationEvidenceService {
  private readonly logger = new Logger(AutoRegistrationEvidenceService.name);

  constructor(
    private readonly anpr: AnprService,
    private readonly storage: StorageService,
    @InjectRepository(CameraObservation) private readonly observations: Repository<CameraObservation>,
  ) {}

  async saveEvidencePhoto(
    camera: Camera,
    observation: CameraObservation,
    companyId: string,
    imageBuffer?: Buffer,
  ): Promise<void> {
    try {
      const buffer = imageBuffer ?? await this.anpr.observationImage(camera.id, observation.id);
      const date = new Date().toISOString().slice(0, 10);
      const key = `evidence/${companyId}/${date}/${observation.id}.jpg`;
      await this.storage.putEvidence(key, buffer, 'image/jpeg');
      observation.photoPath = key;
      await this.observations.save(observation);
      this.logger.debug(`Evidence photo saved: ${key}`);
    } catch (err) {
      this.logger.warn(`Failed to save evidence photo: ${String(err)}`);
    }
  }
}
