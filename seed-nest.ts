import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const torneo = await prisma.torneo.findFirst({
    where: { nombre: { contains: 'Snoopy', mode: 'insensitive' } },
  });

  if (!torneo) {
    console.log('No se encontró el torneo Snoopy');
    await app.close();
    return;
  }

  console.log(`Encontrado torneo: ${torneo.nombre} (${torneo.id})`);

  const equiposNames = ['Los Pelícanos', 'Rayo Macul', 'Sporting Club', 'Real Fuchi'];

  for (const nombreEquipo of equiposNames) {
    let equipo = await prisma.equipo.findFirst({
      where: { torneoId: torneo.id, nombre: nombreEquipo },
    });

    if (!equipo) {
      console.log(`Creando equipo: ${nombreEquipo}`);
      equipo = await prisma.equipo.create({
        data: {
          nombre: nombreEquipo,
          torneoId: torneo.id,
        },
      });

      await prisma.inscripcion.create({
        data: {
          torneoId: torneo.id,
          equipoId: equipo.id,
          estado: 'APROBADA',
        },
      });
    }

    for (let i = 1; i <= 3; i++) {
      const email = `jugador${i}_${nombreEquipo.replace(' ', '').toLowerCase()}@test.com`;
      let usuario = await prisma.usuario.findUnique({ where: { email } });

      if (!usuario) {
        usuario = await prisma.usuario.create({
          data: {
            nombre: `Jugador ${i} de ${nombreEquipo}`,
            email,
            passwordHash: await bcrypt.hash('123456', 10),
          },
        });
      }

      const ue = await prisma.usuarioEquipo.findUnique({
        where: { usuarioId_equipoId: { usuarioId: usuario.id, equipoId: equipo.id } },
      });

      if (!ue) {
        await prisma.usuarioEquipo.create({
          data: {
            usuarioId: usuario.id,
            equipoId: equipo.id,
          },
        });
        console.log(`  -> Añadido ${usuario.nombre}`);
      }
    }
  }

  console.log('Equipos y jugadores añadidos correctamente a la Copa Snoopy.');
  await app.close();
}

bootstrap();
