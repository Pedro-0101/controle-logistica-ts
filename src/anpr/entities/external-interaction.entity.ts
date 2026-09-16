import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Camera } from '../../camera/entities/camera.entity.js';
import { Point } from '../../point/entities/point.entity.js';
import { Company } from '../../company/entities/company.entity.js';
import { CameraObservation } from '../../monitoring/observation.entity.js';
import { Movement } from '../../movement/entities/movement.entity.js';

export const enumExternalOutcomes = [
  'success',
  'no_plate',
  'low_confidence',
  'timeout',
  'error',
  'rate_limited',
] as const;

export const enumFinalSources = [
  'external',
  'local',
  'local_fallback',
  'none',
] as const;

export type ExternalOutcome = (typeof enumExternalOutcomes)[number];
export type FinalSource = (typeof enumFinalSources)[number];

const numericTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * Auditoria de cada chamada feita às APIs externas de reconhecimento.
 *
 * Guarda latência, status HTTP, unidades cobráveis e custo estimado para
 * permitir acompanhar gasto e desempenho por empresa/câmera/período.
 * A gravação é best-effort: falhas aqui nunca impedem a criação do movimento.
 */
@Entity('anpr_external_interactions')
@Index('IDX_ext_interactions_company_created', ['companyId', 'createdAt'])
@Index('IDX_ext_interactions_provider_created', ['provider', 'createdAt'])
@Index('IDX_ext_interactions_observation', ['observationId'])
export class ExternalInteraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_ext_interactions_company', onDelete: 'CASCADE' })
  companyId: string;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => Camera, { name: 'FK_ext_interactions_camera', onDelete: 'SET NULL' })
  cameraId: string | null;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => Point, { name: 'FK_ext_interactions_point', onDelete: 'SET NULL' })
  pointId: string | null;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => CameraObservation, { name: 'FK_ext_interactions_observation', onDelete: 'SET NULL' })
  observationId: string | null;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => Movement, { name: 'FK_ext_interactions_movement', onDelete: 'SET NULL' })
  movementId: string | null;

  @Column()
  provider: string;

  @Column()
  mode: string;

  @Column({ type: 'varchar', nullable: true })
  localPlate: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalPlate: string | null;

  @Column({ type: 'varchar', nullable: true })
  finalPlate: string | null;

  @Column({ type: 'varchar', nullable: true })
  finalSource: string | null;

  @Column()
  outcome: ExternalOutcome;

  @Column({ type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  latencyMs: number | null;

  @Column({ type: 'int', default: 0 })
  billableUnits: number;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: numericTransformer })
  unitCost: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 6, nullable: true, transformer: numericTransformer })
  costAmount: number | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  costCurrency: string;

  @Column({ type: 'int', nullable: true })
  requestBytes: number | null;

  @Column({ type: 'int', nullable: true })
  responseBytes: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
