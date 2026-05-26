import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt } from 'class-validator';

export enum MatchControlAction {
  START_FIRST_HALF = 'START_FIRST_HALF',
  PAUSE_HALF_TIME = 'PAUSE_HALF_TIME',
  START_SECOND_HALF = 'START_SECOND_HALF',
  START_PENALTIES = 'START_PENALTIES',
  END_MATCH = 'END_MATCH',
}

export class MatchControlDto {
  @ApiProperty({ enum: MatchControlAction })
  @IsEnum(MatchControlAction)
  action: MatchControlAction;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  golesPenalesLocal?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  golesPenalesVisitante?: number;
}
