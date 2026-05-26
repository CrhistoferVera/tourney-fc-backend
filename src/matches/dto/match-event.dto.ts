import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { TipoEvento } from '@prisma/client';

export class MatchEventDto {
  @ApiProperty({ enum: TipoEvento })
  @IsEnum(TipoEvento)
  tipo: TipoEvento;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  equipoId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jugadorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minuto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detalle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  asistenciaJugadorId?: string;
}
