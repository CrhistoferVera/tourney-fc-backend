import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTeamDto {
  @ApiProperty({ example: 'Los Tigres FC' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  nombre!: string;

  @ApiProperty({
    example: 'https://cloudinary.com/escudo.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  escudo?: string;

  @ApiProperty({ example: '+591 70000000', required: false })
  @IsOptional()
  @IsString()
  telefonoCapitan?: string;

  @ApiProperty({
    example: 11,
    required: false,
    description: 'Número de jugadores del equipo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de jugadores debe ser un número entero' })
  @Min(1, { message: 'Debe haber al menos 1 jugador' })
  @Max(50, { message: 'No puede superar 50 jugadores' })
  cantidadJugadores?: number;
}
