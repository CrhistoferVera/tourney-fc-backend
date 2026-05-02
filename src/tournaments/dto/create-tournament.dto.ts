import {
  IsString,
  IsEnum,
  IsInt,
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
import { FormatoTorneo } from '@prisma/client';

export class CampoJuegoDto {
  @ApiProperty({ example: 'Cancha Central' })
  @IsString()
  nombre!: string;

  @ApiProperty({ example: 'Av. Principal 123', required: false })
  @IsOptional()
  @IsString()
  direccion?: string;
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

  @ApiProperty({ example: 8, minimum: 2, maximum: 32 })
  @IsInt()
  @Min(2, { message: 'Debe haber al menos 2 equipos' })
  @Max(32, { message: 'No puede haber más de 32 equipos' })
  maxEquipos!: number;

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
}
