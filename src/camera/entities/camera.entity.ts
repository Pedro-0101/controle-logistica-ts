import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ForeignKey,
} from 'typeorm';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';
import { AdminUnity } from '../../admin-unity/entities/admin-unity.entity.js';
import { Point } from '../../point/entities/point.entity.js';
import { Company } from '../../company/entities/company.entity.js';

const enumAuthTypes = ['digest', 'basic'];

@Entity('cameras')
export class Camera {
  @ApiProperty({
    description: 'UUID único da câmera',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'ID da unidade administrativa vinculada à câmera',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => AdminUnity, { name: 'FK_cameras_unit', onDelete: 'RESTRICT' })
  adminUnityId: string;

  @ApiProperty({
    description: 'ID do ponto (entrada/saída) vinculado à câmera',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => Point, { name: 'FK_cameras_point', onDelete: 'RESTRICT' })
  pointId: string;

  @ApiProperty({
    description: 'Nome da câmera',
    example: 'Câmera Portaria 1',
  })
  @Column()
  name: string;

  @ApiProperty({
    description: 'Endereço IP da câmera',
    example: '192.168.11.241',
  })
  @Column()
  ip: string;

  @ApiProperty({
    description: 'Porta HTTP da câmera',
    example: 80,
    default: 80,
  })
  @Column({ default: 80 })
  port: number;

  @ApiProperty({
    description: 'Usuário da câmera',
    example: 'admin',
  })
  @Column({ default: '' })
  username: string;

  @ApiHideProperty()
  @Column({ default: '' })
  password: string;

  @ApiProperty({
    description: 'Tipo de autenticação da câmera',
    example: 'digest',
    enum: enumAuthTypes,
    default: 'digest',
  })
  @Column({ default: 'digest', enum: enumAuthTypes })
  authType: string;

  @ApiProperty({
    description: 'URL completa do snapshot (opcional; senão usa auto-descoberta)',
    example: 'http://192.168.11.241/ISAPI/Streaming/channels/101/picture',
    required: false,
  })
  @Column({ nullable: true })
  snapshotUrl: string;

  @ApiProperty({
    description: 'Descrição opcional da câmera',
    example: 'Entrada principal',
    required: false,
  })
  @Column({ nullable: true })
  description: string;

  @ApiProperty({
    description: 'ID da empresa vinculada à câmera',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_cameras_company', onDelete: 'RESTRICT' })
  companyId: string;

  @ApiProperty({
    description: 'ID do usuário que criou o registro',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column()
  createdById: string;

  @ApiProperty({
    description: 'ID do último usuário que atualizou o registro',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column({ nullable: true })
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
