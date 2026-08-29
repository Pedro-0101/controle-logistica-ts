import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';

const enumUsers = [
  'user',
  'admin',
  'supervisor'
]

@Entity('users')
export class User {
  @ApiProperty({
    description: 'UUID único do usuário',
    example: 'd3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João Silva',
  })
  @Column()
  name: string;

  @ApiProperty({
    description: 'Email do usuário (deve ser único)',
    example: 'joao@email.com',
    format: 'email',
  })
  @Column({ unique: true })
  email: string;

  @ApiHideProperty()
  @Column()
  password: string;

  @ApiProperty({
    description: 'Função do usuário no sistema',
    example: 'user',
    enum: enumUsers,
    default: 'user',
  })
  @Column({ default: "user", enum: enumUsers })
  role: string;

  @ApiProperty({
    description: 'ID da empresa vinculada ao usuário',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Column()
  companyId: string;

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
