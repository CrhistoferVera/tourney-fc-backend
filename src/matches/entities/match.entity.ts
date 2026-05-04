import { ApiProperty } from '@nestjs/swagger';

export class MatchEntity {
  @ApiProperty({ example: 'uuid-1' })
  id!: string;

  @ApiProperty({ example: 'uuid-torneo' })
  torneoId!: string;

  @ApiProperty({ example: 'PENDIENTE' })
  estado!: string;

  @ApiProperty({ example: '2026-05-10T16:00:00.000Z', nullable: true })
  fecha?: Date | null;

  @ApiProperty({ example: 1, nullable: true })
  ronda?: number | null;

  @ApiProperty({ example: 'Fecha 1', nullable: true })
  fase?: string | null;

  @ApiProperty({ example: null, nullable: true })
  golesLocal?: number | null;

  @ApiProperty({ example: null, nullable: true })
  golesVisitante?: number | null;
}