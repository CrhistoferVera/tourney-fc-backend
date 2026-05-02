import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'Juan Perez',
    description: 'Nombre completo del usuario',
    minLength: 3,
    maxLength: 50,
  })
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  nombre!: string;

  @ApiProperty({
    example: 'juan@example.com',
    description: 'Correo electrónico único del usuario',
  })
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  email!: string;

  @ApiProperty({
    example: 'Password123',
    description:
      'Mínimo 8 caracteres, una mayúscula, una minúscula y un número',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe contener al menos 8 caracteres',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula y un número',
  })
  password!: string;

  @ApiProperty({
    example: 'Cochabamba',
    description: 'Zona o ciudad del usuario',
    required: false,
  })
  @IsOptional()
  @IsString()
  zona?: string;
}
