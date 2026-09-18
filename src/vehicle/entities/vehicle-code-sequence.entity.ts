import { Entity, PrimaryColumn, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('vehicle_code_sequences')
export class VehicleCodeSequence {
  @ApiProperty({
    description: 'ID da empresa dona da sequência',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @PrimaryColumn('uuid')
  companyId: string;

  @ApiProperty({
    description: 'Tipo do veículo (thirdParty | visitor)',
    example: 'visitor',
  })
  @PrimaryColumn()
  type: string;

  @ApiProperty({
    description: 'Último número sequencial emitido para o tipo',
    example: 3,
  })
  @Column('int', { default: 0 })
  lastValue: number;
}
