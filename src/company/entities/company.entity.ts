import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('companies')
export class Company {
  @ApiProperty({
    description: 'UUID único da empresa',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Nome fantasia da empresa',
    example: 'Empresa XYZ Ltda',
  })
  @Column()
  name: string;

  @ApiProperty({
    description: 'Razão social da empresa',
    example: 'XYZ Comércio e Serviços Ltda',
  })
  @Column()
  companyName: string;

  @ApiProperty({
    description: 'CNPJ da empresa (formato: XX.XXX.XXX/XXXX-XX)',
    example: '12.345.678/0001-99',
  })
  @Column({ unique: true })
  cnpj: string;

  @ApiProperty({
    description: 'Inscrição estadual da empresa',
    example: '123.456.789.012',
  })
  @Column()
  stateRegistration: string;

  @ApiProperty({
    description: 'Endereço completo da empresa',
    example: 'Rua Example, 123 - Centro - São Paulo/SP - CEP: 01234-567',
  })
  @Column()
  address: string;

  @ApiProperty({
    description: 'Email de contato da empresa',
    example: 'contato@empresa.com.br',
    format: 'email',
  })
  @Column({ unique: true })
  email: string;

  @ApiProperty({
    description: 'Status ativo/inativo da empresa',
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
