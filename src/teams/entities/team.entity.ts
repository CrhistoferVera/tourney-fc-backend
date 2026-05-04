import { ApiProperty } from '@nestjs/swagger';

export class TeamEntity {
  @ApiProperty({ example: 'uuid-1' })
  id!: string;

  @ApiProperty({ example: 'uuid-torneo' })
  torneoId!: string;

  @ApiProperty({ example: 'Los Tigres FC' })
  nombre!: string;

  @ApiProperty({ example: 'https://cloudinary.com/escudo.jpg', nullable: true })
  escudo?: string | null;

  @ApiProperty({ example: '+591 70000000', nullable: true })
  telefonoCapitan?: string | null;

  @ApiProperty({ example: '2026-04-25T00:00:00.000Z' })
  createdAt!: Date;
}