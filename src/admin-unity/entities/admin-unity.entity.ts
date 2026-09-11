import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ForeignKey,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Company } from '../../company/entities/company.entity.js';

@Entity('admin_unities')
export class AdminUnity {
  @ApiProperty({
    description: 'UUID único da unidade administrativa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Nome da unidade administrativa',
    example: 'Unidade Centro',
  })
  @Column()
  name: string;

  @ApiProperty({
    description: 'Código identificador da unidade',
    example: 'UA-001',
  })
  @Column({ unique: true })
  code: string;

  @ApiProperty({
    description: 'Endereço da unidade administrativa',
    example: 'Rua Principal, 123 - Centro, São Paulo - SP',
  })
  @Column()
  address: string;

  @ApiProperty({
    description: 'Telefone de contato da unidade',
    example: '(11) 99999-0000',
  })
  @Column({ nullable: true })
  phone: string;

  @ApiProperty({
    description: 'Email de contato da unidade',
    example: 'unidade.centro@email.com',
    format: 'email',
  })
  @Column({ nullable: true })
  email: string;

  @ApiProperty({
    description: 'ID da empresa vinculada à unidade',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_units_company', onDelete: 'RESTRICT' })
  companyId: string;

  @ApiProperty({
    description: 'Indica se a unidade está ativa',
    example: true,
    default: true,
  })
  @Column({ default: true })
  active: boolean;

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
