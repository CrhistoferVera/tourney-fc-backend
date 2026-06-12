import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const copa = await prisma.torneo.findFirst({
    where: { nombre: { contains: 'Copa Verano' } },
  });
  
  if (!copa) {
    console.log('No se encontró Copa Verano');
    return;
  }
  
  console.log(`Copa Verano ID: ${copa.id}`);
  
  const teamsData = [
    { name: 'Los Tifones', captainName: 'Carlos Cap' },
    { name: 'Rayo Vallecano Sur', captainName: 'Julio Cap' },
    { name: 'Marea Alta FC', captainName: 'Mario Cap' },
  ];

  for (let i = 0; i < teamsData.length; i++) {
    const td = teamsData[i];
    const user = await prisma.usuario.create({
      data: {
        nombre: td.captainName,
        email: `capitan${i + 150}@copa.com`,
        passwordHash: await bcrypt.hash('123456', 10),
      }
    });

    const equipo = await prisma.equipo.create({
      data: {
        nombre: td.name,
        capitanId: user.id,
        escudo: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(td.name)}`,
      }
    });

    await prisma.usuarioEquipo.create({
      data: {
        equipoId: equipo.id,
        usuarioId: user.id,
      }
    });

    for (let j = 1; j <= 5; j++) {
      const pUser = await prisma.usuario.create({
        data: {
          nombre: `Jugador ${j} ${td.name}`,
          email: `jugador${j}_${i+150}@copa.com`,
          passwordHash: await bcrypt.hash('123456', 10),
        }
      });
      await prisma.usuarioEquipo.create({
        data: {
          equipoId: equipo.id,
          usuarioId: pUser.id,
        }
      });
    }

    const inscripcion = await prisma.inscripcion.create({
      data: {
        equipoId: equipo.id,
        torneoId: copa.id,
        estado: 'APROBADA',
      }
    });

    const equipoMiembros = await prisma.usuarioEquipo.findMany({ where: { equipoId: equipo.id } });
    await prisma.inscripcionRoster.createMany({
      data: equipoMiembros.map(m => ({
        inscripcionId: inscripcion.id,
        usuarioId: m.usuarioId
      }))
    });

    console.log(`Equipo ${td.name} creado e inscrito en Copa Verano`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
