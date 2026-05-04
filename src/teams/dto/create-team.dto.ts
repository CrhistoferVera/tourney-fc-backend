import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeamDto {
  @ApiProperty({ example: 'Los Tigres FC' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  nombre!: string;

  @ApiProperty({ example: 'https://cloudinary.com/escudo.jpg', required: false })
  @IsOptional()
  @IsString()
  escudo?: string;

  @ApiProperty({ example: '+591 70000000', required: false })
  @IsOptional()
  @IsString()
  telefonoCapitan?: string;
}