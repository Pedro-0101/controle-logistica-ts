import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Company } from '../../company/entities/company.entity.js';

const enumProtocols = ['http', 'https'];
const enumAuthTypes = ['digest', 'basic'];

@Entity('company_configs')
export class CompanyConfig {
  @ApiProperty({
    description: 'UUID único da configuração',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'ID da empresa vinculada à configuração',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @OneToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  companyId: string;

  // ── Geral ──

  @ApiProperty({
    description: 'Fuso horário da empresa',
    example: 'America/Sao_Paulo',
    default: 'America/Sao_Paulo',
  })
  @Column({ default: 'America/Sao_Paulo' })
  timezone: string;

  @ApiProperty({
    description: 'Idioma do sistema',
    example: 'pt-BR',
    default: 'pt-BR',
  })
  @Column({ default: 'pt-BR' })
  language: string;

  // ── Câmera defaults ──

  @ApiProperty({
    description: 'Protocolo padrão para câmeras',
    example: 'http',
    enum: enumProtocols,
    default: 'http',
  })
  @Column({ default: 'http', enum: enumProtocols })
  cameraDefaultProtocol: string;

  @ApiProperty({
    description: 'Porta padrão para câmeras',
    example: 80,
    default: 80,
  })
  @Column({ default: 80 })
  cameraDefaultPort: number;

  @ApiProperty({
    description: 'Tipo de autenticação padrão para câmeras',
    example: 'digest',
    enum: enumAuthTypes,
    default: 'digest',
  })
  @Column({ default: 'digest', enum: enumAuthTypes })
  cameraDefaultAuthType: string;

  @ApiProperty({
    description: 'Intervalo de snapshot das câmeras em milissegundos',
    example: 1000,
    default: 1000,
  })
  @Column({ default: 1000 })
  cameraSnapshotIntervalMs: number;

  // ── ANPR ──

  @ApiProperty({
    description: 'Confiança mínima para reconhecimento ANPR (0-1)',
    example: 0.85,
    default: 0.85,
  })
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.85 })
  anprConfidenceThreshold: number;

  @ApiProperty({
    description: 'Timeout para match de placa em segundos',
    example: 5,
    default: 5,
  })
  @Column({ default: 5 })
  anprMatchTimeoutSeconds: number;

  @ApiProperty({
    description: 'Número de leituras para confirmar placa',
    example: 2,
    default: 2,
  })
  @Column({ default: 2 })
  anprConfirmationReads: number;

  @ApiProperty({
    description: 'Tempo para considerar observação stale em segundos',
    example: 5,
    default: 5,
  })
  @Column({ default: 5 })
  anprStaleAfterSeconds: number;

  @ApiProperty({
    description: 'Habilitar registro automático de movimentação por ANPR',
    example: false,
    default: false,
  })
  @Column({ default: false })
  anprAutoRegister: boolean;

  @ApiProperty({
    description: 'Salvar foto quando placa não é reconhecida na base de dados',
    example: true,
    default: true,
  })
  @Column({ default: true })
  anprSaveUnrecognizedPhotos: boolean;

  @ApiProperty({
    description: 'Intervalo mínimo em segundos entre movimentos automáticos do mesmo veículo no mesmo ponto',
    example: 30,
    default: 30,
  })
  @Column({ default: 30 })
  anprAutoRegisterCooldownSeconds: number;

  // ── Movimentação ──

  @ApiProperty({
    description: 'Minutos para auto-fechar movimento',
    example: 60,
    default: 60,
  })
  @Column({ default: 60 })
  movementAutoCloseMinutes: number;

  @ApiProperty({
    description: 'Exigir nome do motorista na movimentação',
    example: false,
    default: false,
  })
  @Column({ default: false })
  requireDriverName: boolean;

  @ApiProperty({
    description: 'Exigir motivo na movimentação',
    example: false,
    default: false,
  })
  @Column({ default: false })
  requirePurpose: boolean;

  // ── Audit ──

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
