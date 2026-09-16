import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ForeignKey,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { CameraObservation } from '../../monitoring/observation.entity.js';
import { Point } from '../../point/entities/point.entity.js';
import { Vehicle } from '../../vehicle/entities/vehicle.entity.js';
import { Company } from '../../company/entities/company.entity.js';

const enumMovementTypes = ['entry', 'exit'];
const enumMovementStatus = ['open', 'closed', 'pending_review'];

@Entity('movements')
@Index('UQ_movements_observation', ['observationId'], { unique: true })
export class Movement {
  @Column('uuid', { nullable: true })
  @ForeignKey(() => CameraObservation, { name: 'FK_movements_observation', onDelete: 'RESTRICT' })
  observationId: string | null;
  @ApiProperty({
    description: 'UUID único do movimento',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'ID do ponto vinculado ao movimento',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
  })
  @Column('uuid', { nullable: true })
  @ForeignKey(() => Point, { name: 'FK_movements_point', onDelete: 'RESTRICT' })
  pointId: string;

  @ApiProperty({
    description: 'ID do veículo vinculado ao movimento (nulo quando pending_review)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    required: false,
  })
  @Column('uuid', { nullable: true })
  @ForeignKey(() => Vehicle, { name: 'FK_movements_vehicle', onDelete: 'RESTRICT' })
  vehicleId: string | null;

  @ApiProperty({
    description: 'Tipo do movimento (entrada ou saída)',
    example: 'entry',
    enum: enumMovementTypes,
  })
  @Column({ enum: enumMovementTypes })
  type: string;

  @ApiProperty({
    description: 'Data e hora em que o movimento ocorreu',
    example: '2026-08-29T12:00:00.000Z',
  })
  @Column()
  dateTime: Date;

  @ApiProperty({
    description: 'Status do movimento',
    example: 'open',
    enum: enumMovementStatus,
    default: 'open',
  })
  @Column({ default: 'open', enum: enumMovementStatus })
  status: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao movimento',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_movements_company', onDelete: 'RESTRICT' })
  companyId: string;

  @ApiProperty({
    description: 'Motivo do movimento',
    example: 'Entrega de mercadoria',
    required: false,
  })
  @Column({ nullable: true })
  purpose: string;

  @ApiProperty({
    description: 'Nome do motorista/condutor do veículo',
    example: 'João Silva',
    required: false,
  })
  @Column({ nullable: true })
  driverName: string;

  @ApiProperty({
    description: 'Observações sobre o movimento',
    example: 'Cliente aguardando no portão 2',
    required: false,
  })
  @Column({ nullable: true })
  notes: string;

  @ApiProperty({
    description: 'ID do usuário que criou o registro',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  createdById: string;

  @ApiProperty({
    description: 'Placa reconhecida pelo OCR (pode diferir do veículo se houve correção)',
    example: 'ABC1D23',
    required: false,
  })
  @Column({ type: 'varchar', nullable: true })
  recognizedPlate: string | null;

  @ApiProperty({
    description: 'Se o movimento foi criado automaticamente pelo sistema ANPR',
    example: false,
    default: false,
  })
  @Column({ default: false })
  autoRegistered: boolean;

  @ApiProperty({
    description: 'Provider que forneceu a placa final do movimento (local, google_vision, etc.)',
    example: 'google_vision',
    required: false,
  })
  @Column({ type: 'varchar', nullable: true })
  recognitionProvider: string | null;

  @ApiProperty({
    description: 'Confiança da leitura que originou a placa final (0-1)',
    example: 0.95,
    required: false,
  })
  @Column({ type: 'double precision', nullable: true })
  recognitionConfidence: number | null;

  @ApiProperty({
    description: 'Data e hora do último recálculo do movimento',
    example: '2026-08-29T12:00:00.000Z',
    required: false,
  })
  @Column({ type: 'timestamptz', nullable: true })
  recalculatedAt: Date;

  @ApiProperty({
    description: 'ID do último usuário que atualizou o registro',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid', { nullable: true })
  updatedById: string;

  @ApiProperty({
    description: 'Data e hora da criação do registro',
    example: '2026-08-29T12:00:00.000Z',
  })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({
    description: 'Data e hora da última atualização do registro',
    example: '2026-08-29T12:00:00.000Z',
  })
  @UpdateDateColumn()
  updatedAt: Date;
}
