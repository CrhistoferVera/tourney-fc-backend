import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryTournamentDto {
  @ApiProperty({ example: 'Copa', required: false })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiProperty({ example: 'Cochabamba', required: false })
  @IsOptional()
  @IsString()
  zona?: string;
}