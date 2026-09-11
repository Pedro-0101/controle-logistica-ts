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
import { Company } from '../../company/entities/company.entity.js';

const enumVehicleTypes = [
  'own',
  'thirdParty',
  'visitor'
]

@Entity('vehicles')
@Index('UQ_vehicles_company_plate', ['companyId', 'plate'], { unique: true })
@Index('UQ_vehicles_company_code', ['companyId', 'code'], { unique: true })
export class Vehicle {
  @ApiProperty({
    description: 'UUID único do veículo',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Placa do veículo (deve ser única)',
    example: 'ABC1D23',
  })
  @Column()
  plate: string;

  @ApiProperty({
    description: 'Código identificador do veículo (deve ser único)',
    example: 'VEH-001',
  })
  @Column()
  code: string;

  @ApiProperty({
    description: 'Tipo do veículo no sistema',
    example: 'own',
    enum: enumVehicleTypes,
    default: 'own',
  })
  @Column({ default: "own", enum: enumVehicleTypes })
  type: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao veículo',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_vehicles_company', onDelete: 'RESTRICT' })
  companyId: string;

  @ApiProperty({
    description: 'Indica se o veículo está ativo',
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
