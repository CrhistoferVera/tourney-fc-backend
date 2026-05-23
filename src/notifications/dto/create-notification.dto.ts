import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoNotificacion } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ description: 'UUID del usuario destinatario' })
  @IsUUID()
  usuarioId: string;

  @ApiProperty({ enum: TipoNotificacion })
  @IsEnum(TipoNotificacion)
  tipo: TipoNotificacion;

  @ApiProperty({ example: 'Tu inscripción fue aprobada' })
  @IsString()
  @IsNotEmpty()
  mensaje: string;

  @ApiPropertyOptional({ description: 'UUID del torneo relacionado' })
  @IsOptional()
  @IsUUID()
  torneoId?: string;
}
