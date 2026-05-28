import {
  PrismaClient,
  EstadoTorneo,
  FormatoTorneo,
  ModalidadFutbol,
  RolTorneo,
  EstadoInscripcion,
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
  email: 'organizador.liga4@tourneyfc.com',
};

const TORNEO = {
  nombre: 'Liga TourneyFC 2026 (4 equipos)',
  descripcion: 'Torneo de prueba — 4 equipos, formato liga, fútbol 5',
  formato: FormatoTorneo.LIGA,
  modalidad: ModalidadFutbol.FUTBOL_5,
  maxEquipos: 4,
  maxJugadoresPorEquipo: 10,
  fechaInicio: new Date('2026-06-01'),
  fechaFin: new Date('2026-08-31'),
  zona: 'La Paz',
};

interface EquipoSpec {
  nombre: string;
  escudo: string;
  capitan: { nombre: string; email: string; tel: string };
  jugadores: { nombre: string; email: string }[];
}

const EQUIPOS: EquipoSpec[] = [
  {
    nombre: 'Águilas FC',
    escudo: 'preset_1',
    capitan: { nombre: 'Pedro Aguilar', email: 'pedro.aguilar@tourneyfc.com', tel: '70000001' },
    jugadores: [
      { nombre: 'Juan Pérez',     email: 'juan.perez@tourneyfc.com' },
      { nombre: 'Luis Gómez',     email: 'luis.gomez@tourneyfc.com' },
      { nombre: 'Carlos Rojas',   email: 'carlos.rojas.aguilas@tourneyfc.com' },
      { nombre: 'Andrés Vargas',  email: 'andres.vargas.aguilas@tourneyfc.com' },
      { nombre: 'Mario Suárez',   email: 'mario.suarez.aguilas@tourneyfc.com' },
      { nombre: 'Diego Limachi',  email: 'diego.limachi.aguilas@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Lobos United',
    escudo: 'preset_2',
    capitan: { nombre: 'Roberto Lobo',    email: 'roberto.lobo@tourneyfc.com',    tel: '70000002' },
    jugadores: [
      { nombre: 'Iván Quispe',    email: 'ivan.quispe.lobos@tourneyfc.com' },
      { nombre: 'Pablo Mendoza',  email: 'pablo.mendoza.lobos@tourneyfc.com' },
      { nombre: 'Sergio Flores',  email: 'sergio.flores.lobos@tourneyfc.com' },
      { nombre: 'Ricardo Núñez',  email: 'ricardo.nunez.lobos@tourneyfc.com' },
      { nombre: 'Javier Aramayo', email: 'javier.aramayo.lobos@tourneyfc.com' },
      { nombre: 'Tomás Cárdenas', email: 'tomas.cardenas.lobos@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Tigres SC',
    escudo: 'preset_4',
    capitan: { nombre: 'Daniel Tigre',   email: 'daniel.tigre@tourneyfc.com',   tel: '70000003' },
    jugadores: [
      { nombre: 'Hugo Mamani',    email: 'hugo.mamani.tigres@tourneyfc.com' },
      { nombre: 'Felipe Choque',  email: 'felipe.choque.tigres@tourneyfc.com' },
      { nombre: 'Néstor Villca',  email: 'nestor.villca.tigres@tourneyfc.com' },
      { nombre: 'Óscar Apaza',    email: 'oscar.apaza.tigres@tourneyfc.com' },
      { nombre: 'Eduardo Ticona', email: 'eduardo.ticona.tigres@tourneyfc.com' },
      { nombre: 'Manuel Condori', email: 'manuel.condori.tigres@tourneyfc.com' },
    ],
  },
  {
    nombre: 'Cóndores CF',
    escudo: 'preset_5',
    capitan: { nombre: 'Esteban Cóndor',   email: 'esteban.condor@tourneyfc.com',   tel: '70000004' },
    jugadores: [
      { nombre: 'Raúl Yujra',      email: 'raul.yujra.condores@tourneyfc.com' },
      { nombre: 'Fernando Calle',  email: 'fernando.calle.condores@tourneyfc.com' },
      { nombre: 'Víctor Huanca',   email: 'victor.huanca.condores@tourneyfc.com' },
      { nombre: 'Alejandro Poma',  email: 'alejandro.poma.condores@tourneyfc.com' },
      { nombre: 'Cristian Layme',  email: 'cristian.layme.condores@tourneyfc.com' },
      { nombre: 'Mateo Cusi',      email: 'mateo.cusi.condores@tourneyfc.com' },
    ],
  },
];

async function upsertUsuario(email: string, nombre: string, hash: string) {
  return prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { nombre, email, passwordHash: hash, zona: TORNEO.zona },
  });
}

async function main() {
  const hash = await bcrypt.hash(PASS, 10);
  console.log('🌱 Creando torneo LIGA con 4 equipos inscritos...\n');

  // ── Organizador ─────────────────────────────────────────────────────────────
  const organizador = await upsertUsuario(ORGANIZADOR.email, ORGANIZADOR.nombre, hash);
  console.log(`✅ Organizador: ${organizador.email}`);

  // ── Torneo ───────────────────────────────────────────────────────────────────
  let torneo = await prisma.torneo.findFirst({ where: { nombre: TORNEO.nombre } });
  if (!torneo) {
    torneo = await prisma.torneo.create({
      data: { ...TORNEO, estado: EstadoTorneo.EN_INSCRIPCION },
    });
    await prisma.usuarioTorneo.create({
      data: { usuarioId: organizador.id, torneoId: torneo.id, rol: RolTorneo.ORGANIZADOR },
    });
    console.log(`✅ Torneo creado: ${torneo.nombre} (${torneo.id})`);
  } else {
    console.log(`ℹ️  Torneo ya existía: ${torneo.nombre} (${torneo.id})`);
  }

  // ── Equipos ──────────────────────────────────────────────────────────────────
  for (const spec of EQUIPOS) {
    // Capitán
    const capitan = await upsertUsuario(spec.capitan.email, spec.capitan.nombre, hash);

    // Jugadores (en paralelo)
    const jugadores = await Promise.all(
      spec.jugadores.map((j) => upsertUsuario(j.email, j.nombre, hash)),
    );

    const todosIds = [capitan.id, ...jugadores.map((j) => j.id)];

    // Equipo global
    let equipo = await prisma.equipo.findFirst({
      where: { capitanId: capitan.id, nombre: spec.nombre },
    });
    if (!equipo) {
      equipo = await prisma.equipo.create({
        data: {
          nombre: spec.nombre,
          escudo: spec.escudo,
          telefonoCapitan: spec.capitan.tel,
          capitanId: capitan.id,
        },
      });
    }

    // Membresías globales
    await prisma.usuarioEquipo.createMany({
      data: todosIds.map((usuarioId) => ({ usuarioId, equipoId: equipo.id })),
      skipDuplicates: true,
    });

    // Inscripción APROBADA
    let inscripcion = await prisma.inscripcion.findUnique({
      where: { torneoId_equipoId: { torneoId: torneo.id, equipoId: equipo.id } },
    });
    if (!inscripcion) {
      inscripcion = await prisma.inscripcion.create({
        data: { torneoId: torneo.id, equipoId: equipo.id, estado: EstadoInscripcion.APROBADA },
      });
    } else if (inscripcion.estado !== EstadoInscripcion.APROBADA) {
      await prisma.inscripcion.update({
        where: { id: inscripcion.id },
        data: { estado: EstadoInscripcion.APROBADA },
      });
    }

    // Roster
    await prisma.inscripcionRoster.createMany({
      data: todosIds.map((usuarioId) => ({ inscripcionId: inscripcion.id, usuarioId })),
      skipDuplicates: true,
    });

    // Roles en el torneo
    await prisma.usuarioTorneo.createMany({
      data: todosIds.map((usuarioId) => ({
        usuarioId,
        torneoId: torneo.id,
        rol: usuarioId === capitan.id ? RolTorneo.CAPITAN : RolTorneo.JUGADOR,
      })),
      skipDuplicates: true,
    });

    console.log(`  ⚽ ${spec.nombre} — capitán: ${capitan.email} (${todosIds.length} en roster)`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 Seed completado');
  console.log(`   Torneo    : ${TORNEO.nombre}`);
  console.log(`   ID        : ${torneo.id}`);
  console.log(`   Estado    : EN_INSCRIPCION (4/4 equipos aprobados)`);
  console.log(`   Login org : ${ORGANIZADOR.email} / ${PASS}`);
  EQUIPOS.forEach((e) => console.log(`   Capitán   : ${e.capitan.email} / ${PASS}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💡 Para generar fixture e iniciar el torneo:');
  console.log('   POST /fixtures/tournament/:id/generate');
  console.log('   PATCH /tournaments/:id/start\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
