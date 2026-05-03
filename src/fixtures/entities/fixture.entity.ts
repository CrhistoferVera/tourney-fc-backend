import { ApiProperty } from '@nestjs/swagger';

export class FixturePartidoEntity {
  @ApiProperty({ example: 'uuid-1' })
  id!: string;

  @ApiProperty({ example: 'uuid-torneo' })
  torneoId!: string;

  @ApiProperty({ example: 'uuid-equipo-local' })
  equipoLocalId!: string;

  @ApiProperty({ example: 'uuid-equipo-visitante' })
  equipoVisitanteId!: string;

  @ApiProperty({ example: 1 })
  ronda!: number;

  @ApiProperty({ example: 'Fecha 1', nullable: true })
  fase?: string | null;

  @ApiProperty({ example: 'PENDIENTE' })
  estado!: string;

  @ApiProperty({ example: null, nullable: true })
  fecha?: Date | null;

  @ApiProperty({ example: null, nullable: true })
  campoId?: string | null;
}