import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ForeignKey,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AdminUnity } from '../../admin-unity/entities/admin-unity.entity.js';
import { Company } from '../../company/entities/company.entity.js';

const enumPointTypes = ['entry', 'exit', 'both'];

@Entity('points')
export class Point {
  @ApiProperty({
    description: 'UUID único do ponto',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Nome do ponto (ex.: Portão 1)',
    example: 'Portão 1',
  })
  @Column()
  name: string;

  @ApiProperty({
    description: 'Código identificador do ponto',
    example: 'P-001',
  })
  @Column({ unique: true })
  code: string;

  @ApiProperty({
    description: 'Tipo do ponto (entrada, saída ou ambos)',
    example: 'entry',
    enum: enumPointTypes,
    default: 'both',
  })
  @Column({ default: 'both', enum: enumPointTypes })
  type: string;

  @ApiProperty({
    description: 'ID da unidade administrativa vinculada ao ponto',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => AdminUnity, { name: 'FK_points_unit', onDelete: 'RESTRICT' })
  adminUnityId: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao ponto',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_points_company', onDelete: 'RESTRICT' })
  companyId: string;

  @ApiProperty({
    description: 'Indica se o ponto está ativo',
    example: true,
    default: true,
  })
  @Column({ default: true })
  active: boolean;

  // ── ANPR / Auto-registration config ──

  @ApiProperty({
    description: 'Herdar configurações ANPR da empresa. Se true, ignora os campos ANPR abaixo e usa a config da empresa.',
    example: true,
    default: true,
  })
  @Column({ default: true })
  inheritCompanyConfig: boolean;

  @ApiProperty({
    description: 'Habilitar registro automático de movimentação por ANPR neste ponto (usado quando inheritCompanyConfig = false)',
    example: true,
    nullable: true,
    default: null,
  })
  @Column({ type: 'boolean', nullable: true, default: null })
  anprAutoRegister: boolean | null;

  @ApiProperty({
    description: 'Salvar foto quando placa não reconhecida neste ponto (usado quando inheritCompanyConfig = false)',
    example: true,
    nullable: true,
    default: null,
  })
  @Column({ type: 'boolean', nullable: true, default: null })
  anprSaveUnrecognizedPhotos: boolean | null;

  @ApiProperty({
    description: 'Intervalo mínimo em segundos entre movimentos automáticos do mesmo veículo neste ponto (usado quando inheritCompanyConfig = false)',
    example: 30,
    nullable: true,
    default: null,
  })
  @Column({ type: 'int', nullable: true, default: null })
  anprAutoRegisterCooldownSeconds: number | null;

  @ApiProperty({
    description: 'Confiança mínima para reconhecimento ANPR neste ponto (usado quando inheritCompanyConfig = false)',
    example: 0.85,
    nullable: true,
    default: null,
  })
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, default: null })
  anprConfidenceThreshold: number | null;

  @ApiProperty({
    description: 'Timeout para match de placa em segundos neste ponto (usado quando inheritCompanyConfig = false)',
    example: 5,
    nullable: true,
    default: null,
  })
  @Column({ type: 'int', nullable: true, default: null })
  anprMatchTimeoutSeconds: number | null;

  @ApiProperty({
    description: 'Número de leituras para confirmar placa neste ponto (usado quando inheritCompanyConfig = false)',
    example: 2,
    nullable: true,
    default: null,
  })
  @Column({ type: 'int', nullable: true, default: null })
  anprConfirmationReads: number | null;

  @ApiProperty({
    description: 'Tempo para considerar observação stale em segundos neste ponto (usado quando inheritCompanyConfig = false)',
    example: 5,
    nullable: true,
    default: null,
  })
  @Column({ type: 'int', nullable: true, default: null })
  anprStaleAfterSeconds: number | null;

  @ApiProperty({
    description: 'Modo de reconhecimento ANPR neste ponto: local, verified ou external (usado quando inheritCompanyConfig = false)',
    example: 'local',
    nullable: true,
    default: null,
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  anprRecognitionMode: string | null;

  @ApiProperty({
    description: 'Provider externo de reconhecimento de placas neste ponto (usado quando inheritCompanyConfig = false)',
    example: 'google_vision',
    nullable: true,
    default: null,
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  anprExternalProvider: string | null;

  @ApiProperty({
    description: 'Confiança mínima para aceitar a placa da API externa neste ponto (usado quando inheritCompanyConfig = false)',
    example: 0.7,
    nullable: true,
    default: null,
  })
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, default: null })
  anprExternalMinConfidence: number | null;

  @ApiProperty({
    description: 'Timeout em milissegundos da API externa neste ponto (usado quando inheritCompanyConfig = false)',
    example: 8000,
    nullable: true,
    default: null,
  })
  @Column({ type: 'int', nullable: true, default: null })
  anprExternalTimeoutMs: number | null;

  @ApiProperty({
    description: 'Usar leitura local quando a API externa falhar neste ponto (usado quando inheritCompanyConfig = false)',
    example: true,
    nullable: true,
    default: null,
  })
  @Column({ type: 'boolean', nullable: true, default: null })
  anprExternalFallbackToLocal: boolean | null;

  @ApiProperty({
    description: 'ID do usuário que criou o registro',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  createdById: string;

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
