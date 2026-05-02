import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'juan@example.com',
    description: 'Correo electrónico registrado',
  })
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  email!: string;

  @ApiProperty({
    example: 'Password123',
    description: 'Contraseña del usuario',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe contener al menos 8 caracteres',
  })
  password!: string;
}
