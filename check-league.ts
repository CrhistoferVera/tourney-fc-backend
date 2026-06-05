import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const torneos = await prisma.torneo.findMany({
    where: { nombre: { contains: 'TourneyFC', mode: 'insensitive' } },
    include: {
      inscripciones: {
        include: {
          equipo: true
        }
      }
    }
  });

  console.log('Torneos encontrados:', JSON.stringify(torneos, null, 2));

  // Also search for a tournament with "Liga"
  const ligas = await prisma.torneo.findMany({
    where: { formato: 'LIGA' },
    include: {
        inscripciones: {
            include: {
              equipo: true
            }
        }
    }
  });
  console.log('Ligas encontradas:', JSON.stringify(ligas, null, 2));
}

main().finally(() => prisma.$disconnect());
