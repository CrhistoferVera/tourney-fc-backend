import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const torneos = await prisma.torneo.findMany({ select: { id: true, nombre: true } });
  console.log('Torneos:', torneos);
  await app.close();
}

bootstrap();
