import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushMessagingService implements OnModuleInit {
  private readonly logger = new Logger(PushMessagingService.name);
  private initialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.ensureFirebaseApp();
  }

  private ensureFirebaseApp(): boolean {
    if (this.initialized) return true;

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKeyRaw = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKeyRaw) {
      this.logger.warn(
        'Firebase Admin no configurado (FIREBASE_*). Las push quedarán deshabilitadas.',
      );
      return false;
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    this.initialized = true;
    this.logger.log('Firebase Admin SDK inicializado');
    return true;
  }

  async sendToUser(usuarioId: string, payload: PushPayload): Promise<void> {
    if (!this.ensureFirebaseApp()) return;

    const devices = await this.prisma.usuarioDevice.findMany({
      where: { usuarioId },
      select: { id: true, token: true },
    });

    if (devices.length === 0) {
      this.logger.debug(`Sin dispositivos registrados para usuario ${usuarioId}`);
      return;
    }

    const messaging = admin.messaging();
    const data = payload.data ?? {};

    const results = await Promise.allSettled(
      devices.map((device) =>
        messaging.send({
          token: device.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data,
          android: { priority: 'high' },
        }),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') continue;

      const error = result.reason as { code?: string };
      const code = error?.code ?? '';
      const invalidToken =
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token';

      if (invalidToken) {
        await this.prisma.usuarioDevice
          .delete({ where: { id: devices[i].id } })
          .catch(() => null);
        this.logger.warn(`Token inválido eliminado: ${devices[i].id}`);
      } else {
        this.logger.error(
          `Error enviando push a dispositivo ${devices[i].id}: ${code || result.reason}`,
        );
      }
    }
  }
}
