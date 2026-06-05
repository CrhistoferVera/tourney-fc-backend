import { PrismaClient, EstadoPartido, FaseJuego } from '@prisma/client';
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
  const nombreTorneo = 'TourneyFC 8 equipos';
  
  console.log(`Buscando torneo: ${nombreTorneo}`);
  let torneo = await prisma.torneo.findFirst({
    where: { nombre: { contains: 'TourneyFC', mode: 'insensitive' } },
    include: {
      inscripciones: {
        include: { equipo: true }
      }
    }
  });

  if (!torneo) {
    console.log(`No se encontró el torneo ${nombreTorneo}`);
    return;
  }

  console.log(`Torneo encontrado: ${torneo.nombre} (ID: ${torneo.id})`);

  const equipos = torneo.inscripciones.map(ins => ins.equipo);
  
  if (equipos.length < 2) {
      console.log('No hay suficientes equipos para crear partidos');
      return;
  }

  // Si no hay partidos, creamos unos cuantos
  const existingMatches = await prisma.partido.count({
    where: { torneoId: torneo.id }
  });

  if (existingMatches > 0) {
      console.log(`Ya existen ${existingMatches} partidos en este torneo. Generando más datos...`);
  }

  let partidosCreados = 0;

  // Let's create 2 matches for each team just to give some standings data
  for (let i = 0; i < equipos.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, equipos.length); j++) {
      const local = equipos[i];
      const visitante = equipos[j];
      
      const golesLocal = Math.floor(Math.random() * 4); // 0 to 3 goals
      const golesVisitante = Math.floor(Math.random() * 4); // 0 to 3 goals

      await prisma.partido.create({
          data: {
              torneoId: torneo.id,
              equipoLocalId: local.id,
              equipoVisitanteId: visitante.id,
              estado: EstadoPartido.CONFIRMADO,
              faseJuego: FaseJuego.FINALIZADO,
              golesLocal,
              golesVisitante,
              confirmadoPorLocal: true,
              confirmadoPorVisitante: true,
              fecha: new Date(), // hoy
              minutosJugados: 90,
          }
      });
      console.log(`Partido creado: ${local.nombre} ${golesLocal} - ${golesVisitante} ${visitante.nombre}`);
      partidosCreados++;
    }
  }

  console.log(`¡Se han creado ${partidosCreados} partidos con resultados para la liga ${torneo.nombre}!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
