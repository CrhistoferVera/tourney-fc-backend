import {
  IsString,
  IsEnum,
  IsInt,
  IsNumber,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { FormatoTorneo, ModalidadFutbol } from '@prisma/client';

export class CampoJuegoDto {
  @ApiProperty({ example: 'Cancha Central' })
  @IsString()
  nombre!: string;

  @ApiProperty({ example: 'Av. Principal 123', required: false })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ example: -17.3895, required: false })
  @IsOptional()
  @IsNumber()
  latitud?: number;

  @ApiProperty({ example: -66.1568, required: false })
  @IsOptional()
  @IsNumber()
  longitud?: number;
}

export class CreateTournamentDto {
  @ApiProperty({ example: 'Copa Primavera 2026' })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  nombre!: string;

  @ApiProperty({ example: 'Torneo de fútbol amateur', required: false })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ enum: ['LIGA', 'COPA'], example: 'LIGA' })
  @IsEnum(['LIGA', 'COPA'], { message: 'El formato debe ser LIGA o COPA' })
  formato!: FormatoTorneo;

  @ApiProperty({ enum: ['FUTBOL_5', 'FUTBOL_7', 'FUTBOL_11'], example: 'FUTBOL_11', required: false })
  @IsOptional()
  @IsEnum(['FUTBOL_5', 'FUTBOL_7', 'FUTBOL_11'], { message: 'La modalidad debe ser FUTBOL_5, FUTBOL_7 o FUTBOL_11' })
  modalidad?: ModalidadFutbol;

  @ApiProperty({ example: 8, minimum: 2, maximum: 32 })
  @IsInt()
  @Min(2, { message: 'Debe haber al menos 2 equipos' })
  @Max(32, { message: 'No puede haber más de 32 equipos' })
  maxEquipos!: number;

  @ApiProperty({ example: 22, minimum: 1, maximum: 30, required: false })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Debe haber al menos 1 jugador por equipo' })
  @Max(30, { message: 'No puede haber más de 30 jugadores por equipo' })
  maxJugadoresPorEquipo?: number;

  @ApiProperty({ example: '2026-04-15' })
  @IsDateString()
  fechaInicio!: string;

  @ApiProperty({ example: '2026-05-30' })
  @IsDateString()
  fechaFin!: string;

  @ApiProperty({ example: 'Cochabamba', required: false })
  @IsOptional()
  @IsString()
  zona?: string;

  @ApiProperty({ type: [CampoJuegoDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampoJuegoDto)
  campos?: CampoJuegoDto[];

  @ApiProperty({ example: 'https://cloudinary.com/image.png', required: false })
  @IsOptional()
  @IsString()
  imagen?: string;
}
