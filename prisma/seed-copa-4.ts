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

const TORNEO_NAME = 'Copa TourneyFC 4 equipos';
const ORGANIZADOR = { nombre: 'Organizador Copa 4', email: 'organizador.copa4@tourneyfc.com' };

const EQUIPOS = [
  {
    nombre: 'Capitán 1 FC',
    capitan: { nombre: 'Capitán 1', email: 'capitan1.copa4@tourneyfc.com', telefono: '73000001' },
    jugadores: [
      { nombre: 'Jugador 1 A', email: 'jugador1a.copa4@tourneyfc.com' },
      { nombre: 'Jugador 1 B', email: 'jugador1b.copa4@tourneyfc.com' },
      { nombre: 'Jugador 1 C', email: 'jugador1c.copa4@tourneyfc.com' },
      { nombre: 'Jugador 1 D', email: 'jugador1d.copa4@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Halcones AC',
    capitan: { nombre: 'Capitán 2', email: 'capitan2.copa4@tourneyfc.com', telefono: '73000002' },
    jugadores: [
      { nombre: 'Jugador 2 A', email: 'jugador2a.copa4@tourneyfc.com' },
      { nombre: 'Jugador 2 B', email: 'jugador2b.copa4@tourneyfc.com' },
      { nombre: 'Jugador 2 C', email: 'jugador2c.copa4@tourneyfc.com' },
      { nombre: 'Jugador 2 D', email: 'jugador2d.copa4@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Cóndores CF',
    capitan: { nombre: 'Capitán 3', email: 'capitan3.copa4@tourneyfc.com', telefono: '73000003' },
    jugadores: [
      { nombre: 'Jugador 3 A', email: 'jugador3a.copa4@tourneyfc.com' },
      { nombre: 'Jugador 3 B', email: 'jugador3b.copa4@tourneyfc.com' },
      { nombre: 'Jugador 3 C', email: 'jugador3c.copa4@tourneyfc.com' },
      { nombre: 'Jugador 3 D', email: 'jugador3d.copa4@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Tigres SC',
    capitan: { nombre: 'Capitán 4', email: 'capitan4.copa4@tourneyfc.com', telefono: '73000004' },
    jugadores: [
      { nombre: 'Jugador 4 A', email: 'jugador4a.copa4@tourneyfc.com' },
      { nombre: 'Jugador 4 B', email: 'jugador4b.copa4@tourneyfc.com' },
      { nombre: 'Jugador 4 C', email: 'jugador4c.copa4@tourneyfc.com' },
      { nombre: 'Jugador 4 D', email: 'jugador4d.copa4@tourneyfc.com' },
    ],
  },
];

function generarCopa(equipos: { id: string }[]) {
  if (equipos.length !== 4) {
    throw new Error(`generarCopa espera 4 equipos, recibió ${equipos.length}`);
  }

  return [
    { equipoLocalId: equipos[0].id, equipoVisitanteId: equipos[3].id, ronda: 1, fase: 'Semifinal' },
    { equipoLocalId: equipos[1].id, equipoVisitanteId: equipos[2].id, ronda: 1, fase: 'Semifinal' },
    { equipoLocalId: equipos[0].id, equipoVisitanteId: equipos[1].id, ronda: 2, fase: 'Final' },
  ];
}

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
  console.log('🌱 Iniciando seed Copa 4 equipos con canchas registradas...');

  const organizador = await upsertUsuario(ORGANIZADOR.email, ORGANIZADOR.nombre);

  let torneo = await prisma.torneo.findFirst({ where: { nombre: TORNEO_NAME } });
  if (!torneo) {
    torneo = await prisma.torneo.create({
      data: {
        nombre: TORNEO_NAME,
        descripcion: 'Torneo de copa de 4 equipos con canchas registradas',
        formato: FormatoTorneo.COPA,
        maxEquipos: 4,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-08-30'),
        zona: 'La Paz',
      },
    });
  } else {
    torneo = await prisma.torneo.update({
      where: { id: torneo.id },
      data: {
        descripcion: 'Torneo de copa de 4 equipos con canchas registradas',
        formato: FormatoTorneo.COPA,
        maxEquipos: 4,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-08-30'),
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

  if (equipoIds.length !== 4) {
    throw new Error(`Se esperaban 4 equipos creados; se obtuvieron ${equipoIds.length}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 Seed Copa 4 equipos completado');
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
