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

const ORGANIZADOR = {
  nombre: 'Carlos Mendoza',
  email: 'organizador.liga8@tourneyfc.com',
};

const TORNEO_NAME = 'Liga TourneyFC 8 equipos';

const EQUIPOS = [
  {
    nombre: 'Águilas FC',
    escudo: 'preset_1',
    capitan: { nombre: 'Capitán Águilas', email: 'capitan1.liga8@tourneyfc.com', tel: '71000001' },
    jugadores: [
      { nombre: 'Juan Pérez', email: 'juan.perez.liga8@tourneyfc.com' },
      { nombre: 'Luis Gómez', email: 'luis.gomez.liga8@tourneyfc.com' },
      { nombre: 'Carlos Rojas', email: 'carlos.rojas.liga8@tourneyfc.com' },
      { nombre: 'Andrés Vargas', email: 'andres.vargas.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Lobos United',
    escudo: 'preset_2',
    capitan: { nombre: 'Capitán Lobos', email: 'capitan2.liga8@tourneyfc.com', tel: '71000002' },
    jugadores: [
      { nombre: 'Iván Quispe', email: 'ivan.quispe.liga8@tourneyfc.com' },
      { nombre: 'Pablo Mendoza', email: 'pablo.mendoza.liga8@tourneyfc.com' },
      { nombre: 'Sergio Flores', email: 'sergio.flores.liga8@tourneyfc.com' },
      { nombre: 'Ricardo Núñez', email: 'ricardo.nunez.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Tigres SC',
    escudo: 'preset_4',
    capitan: { nombre: 'Capitán Tigres', email: 'capitan3.liga8@tourneyfc.com', tel: '71000003' },
    jugadores: [
      { nombre: 'Hugo Mamani', email: 'hugo.mamani.liga8@tourneyfc.com' },
      { nombre: 'Felipe Choque', email: 'felipe.choque.liga8@tourneyfc.com' },
      { nombre: 'Néstor Villca', email: 'nestor.villca.liga8@tourneyfc.com' },
      { nombre: 'Óscar Apaza', email: 'oscar.apaza.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Cóndores CF',
    escudo: 'preset_5',
    capitan: { nombre: 'Capitán Cóndores', email: 'capitan4.liga8@tourneyfc.com', tel: '71000004' },
    jugadores: [
      { nombre: 'Raúl Yujra', email: 'raul.yujra.liga8@tourneyfc.com' },
      { nombre: 'Fernando Calle', email: 'fernando.calle.liga8@tourneyfc.com' },
      { nombre: 'Víctor Huanca', email: 'victor.huanca.liga8@tourneyfc.com' },
      { nombre: 'Alejandro Poma', email: 'alejandro.poma.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Pumas EC',
    escudo: 'preset_6',
    capitan: { nombre: 'Capitán Pumas', email: 'capitan5.liga8@tourneyfc.com', tel: '71000005' },
    jugadores: [
      { nombre: 'Mateo Cusi', email: 'mateo.cusi.liga8@tourneyfc.com' },
      { nombre: 'Cristian Layme', email: 'cristian.layme.liga8@tourneyfc.com' },
      { nombre: 'Diego Limachi', email: 'diego.limachi.liga8@tourneyfc.com' },
      { nombre: 'Mario Suárez', email: 'mario.suarez.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Zorros CF',
    escudo: 'preset_7',
    capitan: { nombre: 'Capitán Zorros', email: 'capitan6.liga8@tourneyfc.com', tel: '71000006' },
    jugadores: [
      { nombre: 'Javier Núñez', email: 'javier.nunez.liga8@tourneyfc.com' },
      { nombre: 'Tomás Aramayo', email: 'tomas.aramayo.liga8@tourneyfc.com' },
      { nombre: 'Rolando Soria', email: 'rolando.soria.liga8@tourneyfc.com' },
      { nombre: 'André Huanca', email: 'andre.huanca.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Leones FC',
    escudo: 'preset_8',
    capitan: { nombre: 'Capitán Leones', email: 'capitan7.liga8@tourneyfc.com', tel: '71000007' },
    jugadores: [
      { nombre: 'Esteban Catari', email: 'esteban.catari.liga8@tourneyfc.com' },
      { nombre: 'Marco Choque', email: 'marco.choque.liga8@tourneyfc.com' },
      { nombre: 'Rene Quispe', email: 'rene.quispe.liga8@tourneyfc.com' },
      { nombre: 'Damián Apaza', email: 'damian.apaza.liga8@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Toros BFC',
    escudo: 'preset_9',
    capitan: { nombre: 'Capitán Toros', email: 'capitan8.liga8@tourneyfc.com', tel: '71000008' },
    jugadores: [
      { nombre: 'Hernán Choque', email: 'hernan.choque.liga8@tourneyfc.com' },
      { nombre: 'Fredy Poma', email: 'fredy.poma.liga8@tourneyfc.com' },
      { nombre: 'Santiago Flores', email: 'santiago.flores.liga8@tourneyfc.com' },
      { nombre: 'Óscar Achá', email: 'oscar.acha.liga8@tourneyfc.com' },
    ],
  },
];

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
        partidos.push({
          equipoLocalId: local.id,
          equipoVisitanteId: visitante.id,
          ronda: ronda + 1,
          fase: `Fecha ${ronda + 1}`,
        });
      }
    }

    const ultimo = lista.pop();
    if (ultimo) lista.splice(1, 0, ultimo);
  }

  return partidos;
}

async function upsertUsuario(email: string, nombre: string, hash: string) {
  return prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { nombre, email, passwordHash: hash, zona: 'La Paz' },
  });
}

async function createTeam(torneoId: string, team: typeof EQUIPOS[number], hash: string) {
  const capitan = await upsertUsuario(team.capitan.email, team.capitan.nombre, hash);
  const jugadores = await Promise.all(
    team.jugadores.map((j) => upsertUsuario(j.email, j.nombre, hash)),
  );

  let equipo = await prisma.equipo.findFirst({
    where: { nombre: team.nombre, capitanId: capitan.id },
  });

  if (!equipo) {
    equipo = await prisma.equipo.create({
      data: {
        nombre: team.nombre,
        escudo: team.escudo,
        telefonoCapitan: team.capitan.tel,
        cantidadJugadores: team.jugadores.length + 1,
        capitanId: capitan.id,
      },
    });
  }

  const participantes = [capitan, ...jugadores];

  await Promise.all(
    participantes.map((usuario) =>
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
    data: participantes.map((usuario) => ({ inscripcionId: inscripcion.id, usuarioId: usuario.id })),
    skipDuplicates: true,
  });

  await prisma.usuarioTorneo.createMany({
    data: participantes.map((usuario) => ({
      usuarioId: usuario.id,
      torneoId,
      rol: usuario.id === capitan.id ? RolTorneo.CAPITAN : RolTorneo.JUGADOR,
    })),
    skipDuplicates: true,
  });

  return equipo.id;
}

async function main() {
  console.log('🌱 Iniciando seed Liga 8 equipos con canchas registradas...');
  const hash = await bcrypt.hash(PASS, 10);

  const organizador = await upsertUsuario(ORGANIZADOR.email, ORGANIZADOR.nombre, hash);

  let torneo = await prisma.torneo.findFirst({ where: { nombre: TORNEO_NAME } });
  if (!torneo) {
    torneo = await prisma.torneo.create({
      data: {
        nombre: TORNEO_NAME,
        descripcion: 'Liga de 8 equipos con dos canchas registradas',
        formato: FormatoTorneo.LIGA,
        modalidad: ModalidadFutbol.FUTBOL_5,
        maxEquipos: 8,
        maxJugadoresPorEquipo: 10,
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
        descripcion: 'Liga de 8 equipos con dos canchas registradas',
        formato: FormatoTorneo.LIGA,
        modalidad: ModalidadFutbol.FUTBOL_5,
        maxEquipos: 8,
        maxJugadoresPorEquipo: 10,
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

  const equipoIds: { id: string }[] = [];
  for (const team of EQUIPOS) {
    const equipoId = await createTeam(torneo.id, team, hash);
    equipoIds.push({ id: equipoId });
  }

  const partidos = generarLiga(equipoIds);
  await prisma.partido.createMany({
    data: partidos.map((partido, index) => ({
      ...partido,
      torneoId: torneo.id,
      fecha: new Date(Date.UTC(2026, 6, 1 + index)),
      estado: EstadoPartido.PENDIENTE,
    })),
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 Seed Liga 8 equipos completado');
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
