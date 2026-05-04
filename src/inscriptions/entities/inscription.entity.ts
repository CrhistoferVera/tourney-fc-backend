import { ApiProperty } from '@nestjs/swagger';

export class InscriptionEntity {
  @ApiProperty({ example: 'uuid-1' })
  id!: string;

  @ApiProperty({ example: 'uuid-torneo' })
  torneoId!: string;

  @ApiProperty({ example: 'uuid-equipo' })
  equipoId!: string;

  @ApiProperty({ example: 'PENDIENTE' })
  estado!: string;

  @ApiProperty({ example: '2026-04-25T00:00:00.000Z' })
  createdAt!: Date;
}