import {
  PrismaClient,
  EstadoTorneo,
  FormatoTorneo,
  RolTorneo,
  EstadoInscripcion,
  EstadoPartido,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const PASS = 'Password123';

const TORNEO_NAME = 'Copa TourneyFC 8 equipos';
const ORGANIZADOR = { nombre: 'Organizador Copa 8', email: 'organizador.copa8@tourneyfc.com' };

const EQUIPOS = [
  {
    nombre: 'Capitán 1 FC',
    capitan: { nombre: 'Capitán 1', email: 'capitan1@tourneyfc.com', telefono: '71000001' },
    jugadores: [
      { nombre: 'Jugador 1 A', email: 'jugador1.a@tourneyfc.com' },
      { nombre: 'Jugador 1 B', email: 'jugador1.b@tourneyfc.com' },
      { nombre: 'Jugador 1 C', email: 'jugador1.c@tourneyfc.com' },
      { nombre: 'Jugador 1 D', email: 'jugador1.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Rayos del Sur',
    capitan: { nombre: 'Capitán 3', email: 'capitan3@tourneyfc.com', telefono: '71000003' },
    jugadores: [
      { nombre: 'Jugador 3 A', email: 'jugador3.a@tourneyfc.com' },
      { nombre: 'Jugador 3 B', email: 'jugador3.b@tourneyfc.com' },
      { nombre: 'Jugador 3 C', email: 'jugador3.c@tourneyfc.com' },
      { nombre: 'Jugador 3 D', email: 'jugador3.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Dragones FC',
    capitan: { nombre: 'Capitán 4', email: 'capitan4@tourneyfc.com', telefono: '71000004' },
    jugadores: [
      { nombre: 'Jugador 4 A', email: 'jugador4.a@tourneyfc.com' },
      { nombre: 'Jugador 4 B', email: 'jugador4.b@tourneyfc.com' },
      { nombre: 'Jugador 4 C', email: 'jugador4.c@tourneyfc.com' },
      { nombre: 'Jugador 4 D', email: 'jugador4.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Panteras EC',
    capitan: { nombre: 'Capitán 5', email: 'capitan5@tourneyfc.com', telefono: '71000005' },
    jugadores: [
      { nombre: 'Jugador 5 A', email: 'jugador5.a@tourneyfc.com' },
      { nombre: 'Jugador 5 B', email: 'jugador5.b@tourneyfc.com' },
      { nombre: 'Jugador 5 C', email: 'jugador5.c@tourneyfc.com' },
      { nombre: 'Jugador 5 D', email: 'jugador5.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Búhos SC',
    capitan: { nombre: 'Capitán 6', email: 'capitan6@tourneyfc.com', telefono: '71000006' },
    jugadores: [
      { nombre: 'Jugador 6 A', email: 'jugador6.a@tourneyfc.com' },
      { nombre: 'Jugador 6 B', email: 'jugador6.b@tourneyfc.com' },
      { nombre: 'Jugador 6 C', email: 'jugador6.c@tourneyfc.com' },
      { nombre: 'Jugador 6 D', email: 'jugador6.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Zorros CF',
    capitan: { nombre: 'Capitán 7', email: 'capitan7@tourneyfc.com', telefono: '71000007' },
    jugadores: [
      { nombre: 'Jugador 7 A', email: 'jugador7.a@tourneyfc.com' },
      { nombre: 'Jugador 7 B', email: 'jugador7.b@tourneyfc.com' },
      { nombre: 'Jugador 7 C', email: 'jugador7.c@tourneyfc.com' },
      { nombre: 'Jugador 7 D', email: 'jugador7.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Osos United',
    capitan: { nombre: 'Capitán 8', email: 'capitan8@tourneyfc.com', telefono: '71000008' },
    jugadores: [
      { nombre: 'Jugador 8 A', email: 'jugador8.a@tourneyfc.com' },
      { nombre: 'Jugador 8 B', email: 'jugador8.b@tourneyfc.com' },
      { nombre: 'Jugador 8 C', email: 'jugador8.c@tourneyfc.com' },
      { nombre: 'Jugador 8 D', email: 'jugador8.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Caimanes FC',
    capitan: { nombre: 'Capitán 9', email: 'capitan9@tourneyfc.com', telefono: '71000009' },
    jugadores: [
      { nombre: 'Jugador 9 A', email: 'jugador9.a@tourneyfc.com' },
      { nombre: 'Jugador 9 B', email: 'jugador9.b@tourneyfc.com' },
      { nombre: 'Jugador 9 C', email: 'jugador9.c@tourneyfc.com' },
      { nombre: 'Jugador 9 D', email: 'jugador9.d@tourneyfc.com' },
    ],
  },
];

async function upsertUsuario(email: string, nombre: string) {
  const passwordHash = await bcrypt.hash(PASS, 10);
  return prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { nombre, email, passwordHash, zona: 'La Paz' },
  });
}

async function createTeamAndInscription(torneoId: string, team: typeof EQUIPOS[number]) {
  const capitan = await upsertUsuario(team.capitan.email, team.capitan.nombre);
  const jugadores = await Promise.all(team.jugadores.map((jugador) => upsertUsuario(jugador.email, jugador.nombre)));

  let equipo = await prisma.equipo.findFirst({
    where: { nombre: team.nombre, capitanId: capitan.id },
  });

  if (!equipo) {
    equipo = await prisma.equipo.create({
      data: {
        nombre: team.nombre,
        escudo: 'preset_1',
        telefonoCapitan: team.capitan.telefono,
        cantidadJugadores: team.jugadores.length + 1,
        capitanId: capitan.id,
      },
    });
  }

  const participanteIds = [capitan.id, ...jugadores.map((jugador) => jugador.id)];

  await Promise.all(
    participanteIds.map((usuarioId) =>
      prisma.usuarioEquipo.upsert({
        where: { usuarioId_equipoId: { usuarioId, equipoId: equipo.id } },
        update: {},
        create: { usuarioId, equipoId: equipo.id },
      }),
    ),
  );

  const inscripcion = await prisma.inscripcion.upsert({
    where: { torneoId_equipoId: { torneoId, equipoId: equipo.id } },
    update: { estado: EstadoInscripcion.APROBADA },
    create: { torneoId, equipoId: equipo.id, estado: EstadoInscripcion.APROBADA },
  });

  await prisma.inscripcionRoster.createMany({
    data: participanteIds.map((usuarioId) => ({ inscripcionId: inscripcion.id, usuarioId })),
    skipDuplicates: true,
  });

  await prisma.usuarioTorneo.createMany({
    data: participanteIds.map((usuarioId) => ({
      usuarioId,
      torneoId,
      rol: usuarioId === capitan.id ? RolTorneo.CAPITAN : RolTorneo.JUGADOR,
    })),
    skipDuplicates: true,
  });

  return equipo.id;
}

async function main() {
  console.log('🌱 Iniciando seed Copa 8 equipos con canchas registradas...');

  const organizador = await upsertUsuario(ORGANIZADOR.email, ORGANIZADOR.nombre);

  let torneo = await prisma.torneo.findFirst({ where: { nombre: TORNEO_NAME } });
  if (!torneo) {
    torneo = await prisma.torneo.create({
      data: {
        nombre: TORNEO_NAME,
        descripcion: 'Torneo de copa con 8 equipos y canchas registradas',
        formato: FormatoTorneo.COPA,
        maxEquipos: 8,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-09-30'),
        zona: 'La Paz',
      },
    });
  } else {
    torneo = await prisma.torneo.update({
      where: { id: torneo.id },
      data: {
        descripcion: 'Torneo de copa con 8 equipos y canchas registradas',
        formato: FormatoTorneo.COPA,
        maxEquipos: 8,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-09-30'),
        zona: 'La Paz',
      },
    });
  }

  await prisma.usuarioTorneo.upsert({
    where: { usuarioId_torneoId: { usuarioId: organizador.id, torneoId: torneo.id } },
    update: { rol: RolTorneo.ORGANIZADOR },
    create: { usuarioId: organizador.id, torneoId: torneo.id, rol: RolTorneo.ORGANIZADOR },
  });

  await prisma.campoJuego.createMany({
    data: [
      { torneoId: torneo.id, nombre: 'Cancha Central', direccion: 'Av. Montes 123, La Paz' },
      { torneoId: torneo.id, nombre: 'Cancha Norte', direccion: 'Calle Murillo 456, La Paz' },
    ],
  });

  const equipoIds = [] as { id: string }[];

  for (const team of EQUIPOS) {
    const equipoId = await createTeamAndInscription(torneo.id, team);
    equipoIds.push({ id: equipoId });
  }

  if (equipoIds.length !== 8) {
    throw new Error(`Se esperaban 8 equipos creados; se obtuvieron ${equipoIds.length}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 Seed Copa 8 equipos completado');
  console.log(`   Torneo        : ${TORNEO_NAME}`);
  console.log(`   Organizador   : ${ORGANIZADOR.email} / ${PASS}`);
  console.log(`   Primer capitán: ${EQUIPOS[0].capitan.email} / ${PASS}`);
  console.log('   Canchas       : Cancha Central, Cancha Norte');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
