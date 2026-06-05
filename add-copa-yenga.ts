import { PrismaClient, FormatoTorneo, ModalidadFutbol } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const nombreTorneo = 'Copa Yenga';
  
  console.log(`Buscando torneo: ${nombreTorneo}`);
  let torneo = await prisma.torneo.findFirst({
    where: { nombre: { contains: 'Yenga', mode: 'insensitive' } },
  });

  if (!torneo) {
    console.log(`No se encontró el torneo. Creando torneo: ${nombreTorneo}`);
    torneo = await prisma.torneo.create({
      data: {
        nombre: nombreTorneo,
        descripcion: 'Torneo de ejemplo Yenga',
        formato: FormatoTorneo.COPA,
        modalidad: ModalidadFutbol.FUTBOL_5,
        maxEquipos: 16,
        maxJugadoresPorEquipo: 10,
        fechaInicio: new Date(),
        fechaFin: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      },
    });
  }

  console.log(`Torneo encontrado/creado: ${torneo.nombre} (ID: ${torneo.id})`);

  const equiposData = [
    {
      nombre: 'Real Madrid 2017',
      jugadores: [
        { nombre: 'Cristiano Ronaldo', email: 'cr7@rm2017.com' }, // reusing names is fine, but emails must be unique for Prisma findUnique
        { nombre: 'Sergio Ramos', email: 'ramos@rm2017.com' },
        { nombre: 'Luka Modrić', email: 'modric@rm2017.com' },
        { nombre: 'Toni Kroos', email: 'kroos@rm2017.com' },
        { nombre: 'Marcelo', email: 'marcelo@rm2017.com' },
      ],
    },
    {
      nombre: 'Man United 1999',
      jugadores: [
        { nombre: 'Roy Keane', email: 'keane@mu1999.com' },
        { nombre: 'David Beckham', email: 'beckham@mu1999.com' },
        { nombre: 'Ryan Giggs', email: 'giggs@mu1999.com' },
        { nombre: 'Paul Scholes', email: 'scholes@mu1999.com' },
        { nombre: 'Peter Schmeichel', email: 'schmeichel@mu1999.com' },
      ],
    },
    {
      nombre: 'Liverpool 2005',
      jugadores: [
        { nombre: 'Steven Gerrard', email: 'gerrard@liv2005.com' },
        { nombre: 'Xabi Alonso', email: 'alonso@liv2005.com' },
        { nombre: 'Jamie Carragher', email: 'carragher@liv2005.com' },
        { nombre: 'Jerzy Dudek', email: 'dudek@liv2005.com' },
        { nombre: 'Luis García', email: 'garcia@liv2005.com' },
      ],
    },
    {
      nombre: 'Juventus 1996',
      jugadores: [
        { nombre: 'Alessandro Del Piero', email: 'delpiero@juv1996.com' },
        { nombre: 'Didier Deschamps', email: 'deschamps@juv1996.com' },
        { nombre: 'Antonio Conte', email: 'conte@juv1996.com' },
        { nombre: 'Ciro Ferrara', email: 'ferrara@juv1996.com' },
        { nombre: 'Gianluca Vialli', email: 'vialli@juv1996.com' },
      ],
    },
  ];

  let adminUser = await prisma.usuario.findFirst();

  for (const equipoData of equiposData) {
    let equipo = await prisma.equipo.findFirst({
      where: { nombre: equipoData.nombre },
    });

    if (!equipo) {
      console.log(`Creando equipo: ${equipoData.nombre}`);
      equipo = await prisma.equipo.create({
        data: {
          nombre: equipoData.nombre,
          capitanId: adminUser!.id,
        },
      });

      // Crear inscripción al torneo
      await prisma.inscripcion.create({
        data: {
          torneoId: torneo.id,
          equipoId: equipo.id,
          estado: 'APROBADA',
        },
      });
    } else {
        // Verificar inscripción
        const inscripcion = await prisma.inscripcion.findFirst({
           where: { torneoId: torneo.id, equipoId: equipo.id }
        });
        if (!inscripcion) {
            await prisma.inscripcion.create({
                data: {
                  torneoId: torneo.id,
                  equipoId: equipo.id,
                  estado: 'APROBADA',
                },
              });
        }
    }

    for (const jugador of equipoData.jugadores) {
      let usuario = await prisma.usuario.findUnique({ where: { email: jugador.email } });

      if (!usuario) {
        usuario = await prisma.usuario.create({
          data: {
            nombre: jugador.nombre,
            email: jugador.email,
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
        console.log(`  -> Añadido ${usuario.nombre} al equipo ${equipo.nombre}`);
      }
    }
  }

  console.log(`¡4 equipos añadidos correctamente a la ${torneo.nombre}!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
