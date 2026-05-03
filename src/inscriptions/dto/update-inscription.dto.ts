import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EstadoInscripcion } from '@prisma/client';

export class UpdateInscriptionDto {
  @ApiProperty({ enum: EstadoInscripcion, example: 'APROBADA' })
  @IsEnum(EstadoInscripcion)
  estado!: EstadoInscripcion;
}