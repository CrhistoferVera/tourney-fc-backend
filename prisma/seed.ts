import { PrismaClient, EstadoTorneo, FormatoTorneo, RolTorneo, EstadoInscripcion, EstadoPartido } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

async function main() {
  const PASS = 'Password123';
  const hash = await bcrypt.hash(PASS, 10);

  console.log('🌱 Iniciando seed Liga...\n');

  const nombresEquipos = ['Águilas FC', 'Lobos United', 'Tigres SC', 'Cóndores CF', 'Toros BFC', 'Halcones AC', 'Pumas EC', 'Leones FC'];

  await prisma.$transaction(async (tx) => {
    // ── Organizador ────────────────────────────────────────────────────────────
    const organizador = await tx.usuario.upsert({
      where: { email: 'organizador@tourneyfc.com' },
      update: {},
      create: { nombre: 'Carlos Mendoza', email: 'organizador@tourneyfc.com', passwordHash: hash, zona: 'La Paz' },
    });
    console.log(`✅ Organizador: ${organizador.email}`);

    // ── Torneo ─────────────────────────────────────────────────────────────────
    const torneo = await tx.torneo.create({
      data: {
        nombre: 'Copa TourneyFC 2026',
        descripcion: 'Torneo de fútbol sala — 8 equipos, formato liga',
        formato: FormatoTorneo.LIGA,
        maxEquipos: 8,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-06-01'),
        fechaFin: new Date('2026-08-31'),
        zona: 'La Paz',
      },
    });
    await tx.usuarioTorneo.create({
      data: { usuarioId: organizador.id, torneoId: torneo.id, rol: RolTorneo.ORGANIZADOR },
    });
    console.log(`✅ Torneo: ${torneo.nombre} (${torneo.id})`);

    // ── Equipos + capitanes ────────────────────────────────────────────────────
    const equiposCreados: { id: string }[] = [];

    for (let i = 0; i < 8; i++) {
      const num = i + 1;
      const capitan = await tx.usuario.upsert({
        where: { email: `capitan${num}@tourneyfc.com` },
        update: {},
        create: { nombre: `Capitán ${num}`, email: `capitan${num}@tourneyfc.com`, passwordHash: hash, zona: 'La Paz' },
      });
      const equipo = await tx.equipo.create({
        data: { torneoId: torneo.id, nombre: nombresEquipos[i], cantidadJugadores: 5, telefonoCapitan: `7000000${num}` },
      });
      await tx.inscripcion.create({
        data: { torneoId: torneo.id, equipoId: equipo.id, estado: EstadoInscripcion.APROBADA },
      });
      await tx.usuarioEquipo.create({ data: { usuarioId: capitan.id, equipoId: equipo.id } });
      await tx.usuarioTorneo.create({ data: { usuarioId: capitan.id, torneoId: torneo.id, rol: RolTorneo.CAPITAN } });
      equiposCreados.push({ id: equipo.id });
      console.log(`  ⚽ ${nombresEquipos[i]} — ${capitan.email}`);
    }

    // ── Fixture ────────────────────────────────────────────────────────────────
    const partidos = generarLiga(equiposCreados);
    const fechaInicio = new Date('2026-06-01');
    const intervalo = Math.floor(92 / partidos.length);
    await tx.partido.createMany({
      data: partidos.map((p, i) => {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fecha.getDate() + i * intervalo);
        return { ...p, torneoId: torneo.id, fecha, estado: EstadoPartido.PENDIENTE };
      }),
    });
    console.log(`✅ Fixture: ${partidos.length} partidos (7 fechas × 4)`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏆 Seed Liga completado');
    console.log(`   Torneo ID : ${torneo.id}`);
    console.log(`   Login     : organizador@tourneyfc.com / ${PASS}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }, { timeout: 30000 });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
