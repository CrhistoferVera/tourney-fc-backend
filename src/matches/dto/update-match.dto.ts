import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
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
}