import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'Token FCM del dispositivo actual' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
