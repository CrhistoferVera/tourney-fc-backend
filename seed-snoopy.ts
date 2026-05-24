import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Buscar Copa Snoopy
  const torneo = await prisma.torneo.findFirst({
    where: { nombre: { contains: 'Copa Snoopy', mode: 'insensitive' } },
  });

  if (!torneo) {
    console.log('No se encontró el torneo Copa Snoopy');
    return;
  }

  console.log(`Encontrado torneo: ${torneo.nombre} (${torneo.id})`);

  const equiposNames = ['Los Pelícanos', 'Rayo Macul', 'Sporting Club', 'Real Fuchi'];

  for (const nombreEquipo of equiposNames) {
    // Check if team already exists
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

      // Crear inscripción
      await prisma.inscripcion.create({
        data: {
          torneoId: torneo.id,
          equipoId: equipo.id,
          estado: 'APROBADA',
        },
      });
    }

    // Asegurar que tenga 3 jugadores
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

      // Añadir al equipo
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
