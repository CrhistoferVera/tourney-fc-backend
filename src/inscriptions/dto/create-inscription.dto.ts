import { IsString, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInscriptionDto {
  @ApiProperty({ example: 'uuid-equipo' })
  @IsString()
  equipoId!: string;

  @ApiProperty({
    example: ['uuid-jugador-1', 'uuid-jugador-2'],
    description: 'IDs de los jugadores del equipo que participarán en el torneo',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un jugador' })
  @ArrayMaxSize(50, { message: 'No puede haber más de 50 jugadores en el roster' })
  @IsString({ each: true })
  jugadoresIds!: string[];
}
