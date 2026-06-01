import { IsEnum, IsOptional, IsString, IsDateString, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EstadoPartido } from '@prisma/client';

export class UpdateMatchDto {
  @ApiProperty({ enum: ['PENDIENTE', 'CONFIRMADO'], required: false })
  @IsOptional()
  @IsEnum(['PENDIENTE', 'CONFIRMADO'])
  estado?: EstadoPartido;

  @ApiProperty({ example: '2026-05-10T16:00:00.000Z', required: false })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiProperty({ example: 'uuid-campo', required: false })
  @IsOptional()
  @IsString()
  campoId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  golesLocal?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  golesVisitante?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  golesPenalesLocal?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  golesPenalesVisitante?: number;
}
