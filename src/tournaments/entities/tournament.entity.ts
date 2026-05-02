import { ApiProperty } from '@nestjs/swagger';

export class TournamentEntity {
  @ApiProperty({ example: 'uuid-1' })
  id!: string;

  @ApiProperty({ example: 'Copa Primavera 2026' })
  nombre!: string;

  @ApiProperty({ example: 'Torneo de fútbol amateur', nullable: true })
  descripcion?: string | null;

  @ApiProperty({ example: 'LIGA' })
  formato!: string;

  @ApiProperty({ example: 8 })
  maxEquipos!: number;

  @ApiProperty({ example: 'BORRADOR' })
  estado!: string;

  @ApiProperty({ example: '2026-04-15T00:00:00.000Z' })
  fechaInicio!: Date;

  @ApiProperty({ example: '2026-05-30T00:00:00.000Z' })
  fechaFin!: Date;

  @ApiProperty({ example: 'Cochabamba', nullable: true })
  zona?: string | null;

  @ApiProperty({ example: '2026-04-25T00:00:00.000Z' })
  createdAt!: Date;
}
