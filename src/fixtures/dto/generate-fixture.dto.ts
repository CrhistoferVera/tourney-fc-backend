import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FormatoTorneo } from '@prisma/client';

export class GenerateFixtureDto {
  @ApiProperty({ enum: ['LIGA', 'COPA'], example: 'LIGA' })
  @IsEnum(['LIGA', 'COPA'], { message: 'El formato debe ser LIGA o COPA' })
  formato!: FormatoTorneo;
}