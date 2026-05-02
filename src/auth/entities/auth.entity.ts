import { ApiProperty } from '@nestjs/swagger';

export class AuthResponse {
  @ApiProperty({ example: '52bcd51e-6d88-4f46-b442-b4e407d58b6a' })
  id!: string;

  @ApiProperty({ example: 'Juan Perez' })
  nombre!: string;

  @ApiProperty({ example: 'juan@example.com' })
  email!: string;

  @ApiProperty({ example: null, nullable: true })
  fotoPerfil?: string | null;

  @ApiProperty({ example: 'Cochabamba', nullable: true })
  zona?: string | null;

  @ApiProperty({ example: 'Operación exitosa' })
  mensaje?: string;
}

export class RegisterResponse extends AuthResponse {
  @ApiProperty({ example: true })
  registrado!: boolean;
}

export class LoginResponse extends AuthResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;
}
