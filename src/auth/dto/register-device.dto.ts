import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Token FCM nativo del dispositivo' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ example: 'Samsung Galaxy S21' })
  @IsOptional()
  @IsString()
  dispositivo?: string;
}
