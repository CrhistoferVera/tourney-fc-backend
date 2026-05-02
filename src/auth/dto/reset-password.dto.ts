import { IsEmail, IsString, Length, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  codigo!: string;

  @ApiProperty({ example: 'NewPassword123' })
  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe contener al menos 8 caracteres',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula y un número',
  })
  nuevaPassword!: string;
}
