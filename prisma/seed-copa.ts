import { PrismaClient, EstadoTorneo, FormatoTorneo, RolTorneo, EstadoInscripcion, EstadoPartido } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function generarCopa(equipos: { id: string }[]) {
  const partidos: { equipoLocalId: string; equipoVisitanteId: string; ronda: number; fase: string }[] = [];
  const shuffled = [...equipos].sort(() => Math.random() - 0.5);

  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));
  while (shuffled.length < nextPow2) shuffled.push({ id: 'BYE' });

  const faseLabel = shuffled.length === 8 ? 'Cuartos de final' : `Ronda de ${shuffled.length}`;

  for (let i = 0; i < shuffled.length; i += 2) {
    const local = shuffled[i];
    const visitante = shuffled[i + 1];
    if (local.id !== 'BYE' && visitante.id !== 'BYE') {
      partidos.push({ equipoLocalId: local.id, equipoVisitanteId: visitante.id, ronda: 1, fase: faseLabel });
    }
  }

  return partidos;
}

async function main() {
  const PASS = 'Password123';
  const hash = await bcrypt.hash(PASS, 10);

  console.log('🌱 Iniciando seed Copa...\n');

  const nombresEquipos = ['Rayos del Sur', 'Dragones FC', 'Panteras EC', 'Búhos SC', 'Zorros CF', 'Osos United', 'Serpientes AC', 'Caimanes FC'];

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
        nombre: 'Copa Eliminatoria TourneyFC 2026',
        descripcion: 'Torneo de fútbol sala — 8 equipos, formato copa eliminatoria',
        formato: FormatoTorneo.COPA,
        maxEquipos: 8,
        estado: EstadoTorneo.EN_INSCRIPCION,
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-09-30'),
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
      const num = i + 9; // capitan9…capitan16, no colisiona con el seed liga
      const capitan = await tx.usuario.upsert({
        where: { email: `capitan${num}@tourneyfc.com` },
        update: {},
        create: { nombre: `Capitán ${num}`, email: `capitan${num}@tourneyfc.com`, passwordHash: hash, zona: 'La Paz' },
      });
      const equipo = await tx.equipo.create({
        data: { torneoId: torneo.id, nombre: nombresEquipos[i], cantidadJugadores: 5, telefonoCapitan: `7100000${num}` },
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
    const partidos = generarCopa(equiposCreados);
    const fechaInicio = new Date('2026-07-01');
    const intervalo = Math.floor(92 / partidos.length);
    await tx.partido.createMany({
      data: partidos.map((p, i) => {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fecha.getDate() + i * intervalo);
        return { ...p, torneoId: torneo.id, fecha, estado: EstadoPartido.PENDIENTE };
      }),
    });
    console.log(`✅ Fixture: ${partidos.length} partidos (Cuartos de final)`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏆 Seed Copa completado');
    console.log(`   Torneo ID : ${torneo.id}`);
    console.log(`   Login     : organizador@tourneyfc.com / ${PASS}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }, { timeout: 30000 });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
