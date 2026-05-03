import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInscriptionDto {
  @ApiProperty({ example: 'uuid-equipo' })
  @IsString()
  equipoId!: string;
}