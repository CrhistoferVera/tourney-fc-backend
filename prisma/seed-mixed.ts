import {
  PrismaClient,
  EstadoTorneo,
  FormatoTorneo,
  ModalidadFutbol,
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

const CUP_ORG = { nombre: 'Organizador Copa', email: 'organizador.copa@tourneyfc.com' };
const LIGA_ORG = { nombre: 'Organizador Liga', email: 'organizador.liga@tourneyfc.com' };
const STAFF = { nombre: 'Staff Tourney', email: 'staff@tourneyfc.com' };

const CUP_TEAMS = [
  {
    nombre: 'Capitán 1 FC',
    capitan: { nombre: 'Capitán 1', email: 'capitan1@tourneyfc.com', tel: '71000001' },
    jugadores: [
      { nombre: 'Jugador 1 A', email: 'jugador1.a@tourneyfc.com' },
      { nombre: 'Jugador 1 B', email: 'jugador1.b@tourneyfc.com' },
      { nombre: 'Jugador 1 C', email: 'jugador1.c@tourneyfc.com' },
      { nombre: 'Jugador 1 D', email: 'jugador1.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Rayos del Sur',
    capitan: { nombre: 'Capitán 3', email: 'capitan3@tourneyfc.com', tel: '71000003' },
    jugadores: [
      { nombre: 'Jugador 3 A', email: 'jugador3.a@tourneyfc.com' },
      { nombre: 'Jugador 3 B', email: 'jugador3.b@tourneyfc.com' },
      { nombre: 'Jugador 3 C', email: 'jugador3.c@tourneyfc.com' },
      { nombre: 'Jugador 3 D', email: 'jugador3.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Dragones FC',
    capitan: { nombre: 'Capitán 4', email: 'capitan4@tourneyfc.com', tel: '71000004' },
    jugadores: [
      { nombre: 'Jugador 4 A', email: 'jugador4.a@tourneyfc.com' },
      { nombre: 'Jugador 4 B', email: 'jugador4.b@tourneyfc.com' },
      { nombre: 'Jugador 4 C', email: 'jugador4.c@tourneyfc.com' },
      { nombre: 'Jugador 4 D', email: 'jugador4.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Panteras EC',
    capitan: { nombre: 'Capitán 5', email: 'capitan5@tourneyfc.com', tel: '71000005' },
    jugadores: [
      { nombre: 'Jugador 5 A', email: 'jugador5.a@tourneyfc.com' },
      { nombre: 'Jugador 5 B', email: 'jugador5.b@tourneyfc.com' },
      { nombre: 'Jugador 5 C', email: 'jugador5.c@tourneyfc.com' },
      { nombre: 'Jugador 5 D', email: 'jugador5.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Búhos SC',
    capitan: { nombre: 'Capitán 6', email: 'capitan6@tourneyfc.com', tel: '71000006' },
    jugadores: [
      { nombre: 'Jugador 6 A', email: 'jugador6.a@tourneyfc.com' },
      { nombre: 'Jugador 6 B', email: 'jugador6.b@tourneyfc.com' },
      { nombre: 'Jugador 6 C', email: 'jugador6.c@tourneyfc.com' },
      { nombre: 'Jugador 6 D', email: 'jugador6.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Zorros CF',
    capitan: { nombre: 'Capitán 7', email: 'capitan7@tourneyfc.com', tel: '71000007' },
    jugadores: [
      { nombre: 'Jugador 7 A', email: 'jugador7.a@tourneyfc.com' },
      { nombre: 'Jugador 7 B', email: 'jugador7.b@tourneyfc.com' },
      { nombre: 'Jugador 7 C', email: 'jugador7.c@tourneyfc.com' },
      { nombre: 'Jugador 7 D', email: 'jugador7.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Osos United',
    capitan: { nombre: 'Capitán 8', email: 'capitan8@tourneyfc.com', tel: '71000008' },
    jugadores: [
      { nombre: 'Jugador 8 A', email: 'jugador8.a@tourneyfc.com' },
      { nombre: 'Jugador 8 B', email: 'jugador8.b@tourneyfc.com' },
      { nombre: 'Jugador 8 C', email: 'jugador8.c@tourneyfc.com' },
      { nombre: 'Jugador 8 D', email: 'jugador8.d@tourneyfc.com' },
    ],
  },
];

const LIGA_TEAMS = [
  {
    nombre: 'Capitán 2 FC',
    capitan: { nombre: 'Capitán 2', email: 'capitan2@tourneyfc.com', tel: '72000002' },
    jugadores: [
      { nombre: 'Jugador 2 A', email: 'jugador2.a@tourneyfc.com' },
      { nombre: 'Jugador 2 B', email: 'jugador2.b@tourneyfc.com' },
      { nombre: 'Jugador 2 C', email: 'jugador2.c@tourneyfc.com' },
      { nombre: 'Jugador 2 D', email: 'jugador2.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Cóndores CF',
    capitan: { nombre: 'Capitán 9', email: 'capitan9@tourneyfc.com', tel: '72000003' },
    jugadores: [
      { nombre: 'Jugador 9 A', email: 'jugador9.a@tourneyfc.com' },
      { nombre: 'Jugador 9 B', email: 'jugador9.b@tourneyfc.com' },
      { nombre: 'Jugador 9 C', email: 'jugador9.c@tourneyfc.com' },
      { nombre: 'Jugador 9 D', email: 'jugador9.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Tigres SC',
    capitan: { nombre: 'Capitán 10', email: 'capitan10@tourneyfc.com', tel: '72000004' },
    jugadores: [
      { nombre: 'Jugador 10 A', email: 'jugador10.a@tourneyfc.com' },
      { nombre: 'Jugador 10 B', email: 'jugador10.b@tourneyfc.com' },
      { nombre: 'Jugador 10 C', email: 'jugador10.c@tourneyfc.com' },
      { nombre: 'Jugador 10 D', email: 'jugador10.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Leones FC',
    capitan: { nombre: 'Capitán 11', email: 'capitan11@tourneyfc.com', tel: '72000005' },
    jugadores: [
      { nombre: 'Jugador 11 A', email: 'jugador11.a@tourneyfc.com' },
      { nombre: 'Jugador 11 B', email: 'jugador11.b@tourneyfc.com' },
      { nombre: 'Jugador 11 C', email: 'jugador11.c@tourneyfc.com' },
      { nombre: 'Jugador 11 D', email: 'jugador11.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Toros BFC',
    capitan: { nombre: 'Capitán 12', email: 'capitan12@tourneyfc.com', tel: '72000006' },
    jugadores: [
      { nombre: 'Jugador 12 A', email: 'jugador12.a@tourneyfc.com' },
      { nombre: 'Jugador 12 B', email: 'jugador12.b@tourneyfc.com' },
      { nombre: 'Jugador 12 C', email: 'jugador12.c@tourneyfc.com' },
      { nombre: 'Jugador 12 D', email: 'jugador12.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Halcones AC',
    capitan: { nombre: 'Capitán 13', email: 'capitan13@tourneyfc.com', tel: '72000007' },
    jugadores: [
      { nombre: 'Jugador 13 A', email: 'jugador13.a@tourneyfc.com' },
      { nombre: 'Jugador 13 B', email: 'jugador13.b@tourneyfc.com' },
      { nombre: 'Jugador 13 C', email: 'jugador13.c@tourneyfc.com' },
      { nombre: 'Jugador 13 D', email: 'jugador13.d@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Pumas EC',
    capitan: { nombre: 'Capitán 14', email: 'capitan14@tourneyfc.com', tel: '72000008' },
    jugadores: [
      { nombre: 'Jugador 14 A', email: 'jugador14.a@tourneyfc.com' },
      { nombre: 'Jugador 14 B', email: 'jugador14.b@tourneyfc.com' },
      { nombre: 'Jugador 14 C', email: 'jugador14.c@tourneyfc.com' },
      { nombre: 'Jugador 14 D', email: 'jugador14.d@tourneyfc.com' },
    ],
  },
];

function generarCopa(equipos: { id: string }[]) {
  const partidos: { equipoLocalId: string; equipoVisitanteId: string; ronda: number; fase: string }[] = [];
  const lista = [...equipos];
  if (lista.length % 2 !== 0) lista.push({ id: 'BYE' });

  while (lista.length > 1) {
    const local = lista.shift()!;
    const visitante = lista.pop()!;
    if (local.id !== 'BYE' && visitante.id !== 'BYE') {
      partidos.push({ equipoLocalId: local.id, equipoVisitanteId: visitante.id, ronda: 1, fase: 'Cuartos de final' });
    }
  }

  return partidos;
}

function generarLiga(equipos: { id: string }[]) {
  const partidos: { equipoLocalId: string; equipoVisitanteId: string; ronda: number; fase: string }[] = [];
  const lista = [...equipos];
  if (lista.length % 2 !== 0) lista.push({ id: 'BYE' });
  const totalRondas = lista.length - 1;
  const mitad = lista.length / 2;

  for (let ronda = 0; ronda < totalRondas; ronda++) {
    for (let i = 0; i < mitad; i++) {
      const local = lista[i];
      const visitante = lista[lista.length - 1 - i];
      if (local.id !== 'BYE' && visitante.id !== 'BYE') {
        partidos.push({ equipoLocalId: local.id, equipoVisitanteId: visitante.id, ronda: ronda + 1, fase: `Fecha ${ronda + 1}` });
      }
    }
    const ultimo = lista.pop();
    if (ultimo) lista.splice(1, 0, ultimo);
  }

  return partidos;
}

let hashedPassword: string | null = null;

async function upsertUsuario(email: string, nombre: string) {
  if (!hashedPassword) {
    hashedPassword = await bcrypt.hash(PASS, 10);
  }

  return prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { nombre, email, passwordHash: hashedPassword, zona: 'La Paz' },
  });
}

async function createTeamWithPlayers(torneoId: string, team: typeof CUP_TEAMS[number] | typeof LIGA_TEAMS[number]) {
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
        telefonoCapitan: team.capitan.tel,
        cantidadJugadores: team.jugadores.length + 1,
        capitanId: capitan.id,
      },
    });
  }

  const usuarios = [capitan, ...jugadores];

  await Promise.all(
    usuarios.map((usuario) =>
      prisma.usuarioEquipo.upsert({
        where: { usuarioId_equipoId: { usuarioId: usuario.id, equipoId: equipo.id } },
        update: {},
        create: { usuarioId: usuario.id, equipoId: equipo.id },
      }),
    ),
  );

  const inscripcion = await prisma.inscripcion.upsert({
    where: { torneoId_equipoId: { torneoId, equipoId: equipo.id } },
    update: { estado: EstadoInscripcion.APROBADA },
    create: { torneoId, equipoId: equipo.id, estado: EstadoInscripcion.APROBADA },
  });

  await prisma.inscripcionRoster.createMany({
    data: usuarios.map((usuario) => ({ inscripcionId: inscripcion.id, usuarioId: usuario.id })),
    skipDuplicates: true,
  });

  await prisma.usuarioTorneo.createMany({
    data: usuarios.map((usuario) => ({
      usuarioId: usuario.id,
      torneoId,
      rol: usuario.id === capitan.id ? RolTorneo.CAPITAN : RolTorneo.JUGADOR,
    })),
    skipDuplicates: true,
  });

  return equipo.id;
}

async function seedTournament(
  nombre: string,
  descripcion: string,
  formato: FormatoTorneo,
  organizadorInfo: { nombre: string; email: string },
  teams: Array<typeof CUP_TEAMS[number] | typeof LIGA_TEAMS[number]>,
) {
  const organizador = await upsertUsuario(organizadorInfo.email, organizadorInfo.nombre);

  let torneo = await prisma.torneo.findFirst({ where: { nombre } });
  if (!torneo) {
    torneo = await prisma.torneo.create({
      data: {
        nombre,
        descripcion,
        formato,
        maxEquipos: teams.length,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-09-30'),
        zona: 'La Paz',
      },
    });
  } else {
    torneo = await prisma.torneo.update({
      where: { id: torneo.id },
      data: { descripcion, formato, estado: EstadoTorneo.EN_INSCRIPCION },
    });
  }

  await prisma.usuarioTorneo.upsert({
    where: { usuarioId_torneoId: { usuarioId: organizador.id, torneoId: torneo.id } },
    update: { rol: RolTorneo.ORGANIZADOR },
    create: { usuarioId: organizador.id, torneoId: torneo.id, rol: RolTorneo.ORGANIZADOR },
  });

  const equipoIds: { id: string }[] = [];
  for (const team of teams) {
    const equipoId = await createTeamWithPlayers(torneo.id, team);
    equipoIds.push({ id: equipoId });
  }

  if (formato === FormatoTorneo.COPA) {
    const partidos = generarCopa(equipoIds);
    await prisma.partido.createMany({
      data: partidos.map((partido) => ({ ...partido, torneoId: torneo.id, fecha: new Date('2026-07-01'), estado: EstadoPartido.PENDIENTE })),
    });
  } else {
    const partidos = generarLiga(equipoIds);
    await prisma.partido.createMany({
      data: partidos.map((partido) => ({ ...partido, torneoId: torneo.id, fecha: new Date('2026-07-01'), estado: EstadoPartido.PENDIENTE })),
    });
  }

  return torneo.id;
}

async function main() {
  console.log('🌱 Seed personalizado: Copa + Liga + Staff...');

  const staff = await upsertUsuario(STAFF.email, STAFF.nombre);

  const cupId = await seedTournament(
    'Copa TourneyFC para Capitan 1',
    'Torneo tipo copa con 8 equipos y equipo de capitan1 en inscripciones.',
    FormatoTorneo.COPA,
    CUP_ORG,
    CUP_TEAMS,
  );

  const ligaId = await seedTournament(
    'Liga TourneyFC para Capitan 2',
    'Torneo tipo liga con 8 equipos y equipo de capitan2 en inscripciones.',
    FormatoTorneo.LIGA,
    LIGA_ORG,
    LIGA_TEAMS,
  );

  await prisma.usuarioTorneo.upsert({
    where: { usuarioId_torneoId: { usuarioId: staff.id, torneoId: cupId } },
    update: { rol: RolTorneo.STAFF },
    create: { usuarioId: staff.id, torneoId: cupId, rol: RolTorneo.STAFF },
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 Seed personalizado completado');
  console.log(`   Organizador Copa : ${CUP_ORG.email} / ${PASS}`);
  console.log(`   Capitan 1       : ${CUP_TEAMS[0].capitan.email} / ${PASS}`);
  console.log(`   Organizador Liga: ${LIGA_ORG.email} / ${PASS}`);
  console.log(`   Capitan 2       : ${LIGA_TEAMS[0].capitan.email} / ${PASS}`);
  console.log(`   Staff           : ${STAFF.email} / ${PASS}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
