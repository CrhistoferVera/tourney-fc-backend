import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Juan Actualizado',
    description: 'Nuevo nombre del usuario',
    minLength: 3,
    maxLength: 50,
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  nombre?: string;

  @ApiProperty({
    example: 'https://example.com/foto.jpg',
    description: 'URL de la foto de perfil',
    required: false,
  })
  @IsOptional()
  @IsString()
  fotoPerfil?: string;

  @ApiProperty({
    example: 'La Paz',
    description: 'Zona o ciudad del usuario',
    required: false,
  })
  @IsOptional()
  @IsString()
  zona?: string;
}
