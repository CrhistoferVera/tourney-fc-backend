import { Injectable, Logger } from '@nestjs/common';
import { Notificacion, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushMessagingService } from '../firebase/push-messaging.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushMessaging: PushMessagingService,
  ) {}

  /**
   * Crea una notificación en bandeja y dispara push FCM a todos los dispositivos del usuario.
   * Usar este método en lugar de prisma.notificacion.create() directamente.
   */
  async create(
    data: CreateNotificationDto | Prisma.NotificacionCreateInput,
  ): Promise<Notificacion> {
    const notificacion = await this.prisma.notificacion.create({
      data:
        'usuarioId' in data
          ? {
              usuarioId: data.usuarioId,
              tipo: data.tipo,
              mensaje: data.mensaje,
              torneoId: data.torneoId,
            }
          : data,
    });

    await this.dispatchPush(notificacion).catch((err) => {
      this.logger.error(
        `Push fallido para notificación ${notificacion.id}: ${err?.message ?? err}`,
      );
    });

    return notificacion;
  }

  async findByUser(userId: string) {
    return this.prisma.notificacion.findMany({
      where: { usuarioId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        torneo: { select: { id: true, nombre: true } },
      },
    });
  }

  async markAsRead(userId: string, notificacionId: string) {
    const notificacion = await this.prisma.notificacion.findFirst({
      where: { id: notificacionId, usuarioId: userId },
    });
    if (!notificacion) return null;

    return this.prisma.notificacion.update({
      where: { id: notificacionId },
      data: { leida: true },
    });
  }

  private async dispatchPush(notificacion: Notificacion): Promise<void> {
    await this.pushMessaging.sendToUser(notificacion.usuarioId, {
      title: 'TourneyFC',
      body: notificacion.mensaje,
      data: {
        notificacionId: notificacion.id,
        tipo: notificacion.tipo,
        ...(notificacion.torneoId ? { torneoId: notificacion.torneoId } : {}),
      },
    });
  }
}
