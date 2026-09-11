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
