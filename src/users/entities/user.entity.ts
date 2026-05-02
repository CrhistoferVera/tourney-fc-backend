import { ApiProperty } from '@nestjs/swagger';

export class UserEntity {
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

  @ApiProperty({ example: '2026-04-25T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-04-25T00:00:00.000Z' })
  updatedAt!: Date;
}
