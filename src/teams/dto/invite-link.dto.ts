import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInviteLinkDto {
  @ApiProperty({
    example: 7,
    required: false,
    description: 'Días de validez del enlace (default: 7). Usar 0 para enlace sin expiración.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  expiraEnDias?: number;
}
