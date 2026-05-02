import { IsEmail, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCodeDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'El código debe tener exactamente 6 dígitos' })
  codigo!: string;
}
