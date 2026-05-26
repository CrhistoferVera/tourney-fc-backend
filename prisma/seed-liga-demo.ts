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

// Round-robin completo para exactamente 4 equipos (3 fechas × 2 partidos)
function generarLiga4(ids: string[]) {
  const [a, b, c, d] = ids;
  return [
    { equipoLocalId: a, equipoVisitanteId: b, ronda: 1, fase: 'Fecha 1' },
    { equipoLocalId: c, equipoVisitanteId: d, ronda: 1, fase: 'Fecha 1' },
    { equipoLocalId: a, equipoVisitanteId: c, ronda: 2, fase: 'Fecha 2' },
    { equipoLocalId: b, equipoVisitanteId: d, ronda: 2, fase: 'Fecha 2' },
    { equipoLocalId: a, equipoVisitanteId: d, ronda: 3, fase: 'Fecha 3' },
    { equipoLocalId: b, equipoVisitanteId: c, ronda: 3, fase: 'Fecha 3' },
  ];
}

const EQUIPOS = [
  { nombre: 'Águilas FC',    telefono: '71000001' },
  { nombre: 'Lobos United',  telefono: '71000002' },
  { nombre: 'Tigres SC',     telefono: '71000003' },
  { nombre: 'Cóndores CF',   telefono: '71000004' },
];

const PASS = 'Demo1234';

async function main() {
  const hash = await bcrypt.hash(PASS, 10);

  console.log('🌱  Iniciando seed — Liga Demo 4 equipos...\n');

  await prisma.$transaction(
    async (tx) => {
      // ── Organizador ──────────────────────────────────────────────────────────
      const organizador = await tx.usuario.upsert({
        where: { email: 'organizador@demo.com' },
        update: {},
        create: {
          nombre: 'Roberto Flores',
          email: 'organizador@demo.com',
          passwordHash: hash,
          zona: 'La Paz',
        },
      });
      console.log(`✅ Organizador : ${organizador.email}`);

      // ── Torneo ───────────────────────────────────────────────────────────────
      const torneo = await tx.torneo.create({
        data: {
          nombre: 'Liga Relámpago Demo 2026',
          descripcion: 'Torneo de demostración — 4 equipos, formato liga, fútbol 5.',
          formato: FormatoTorneo.LIGA,
          maxEquipos: 4,
          estado: EstadoTorneo.EN_INSCRIPCION,
          fechaInicio: new Date('2026-06-01'),
          fechaFin: new Date('2026-07-31'),
          zona: 'La Paz',
        },
      });
      await tx.usuarioTorneo.create({
        data: { usuarioId: organizador.id, torneoId: torneo.id, rol: RolTorneo.ORGANIZADOR },
      });
      console.log(`✅ Torneo      : ${torneo.nombre}`);
      console.log(`   ID          : ${torneo.id}`);

      // ── Campos de juego ──────────────────────────────────────────────────────
      await tx.campoJuego.createMany({
        data: [
          { torneoId: torneo.id, nombre: 'Cancha Central', direccion: 'Av. Montes 123, La Paz' },
          { torneoId: torneo.id, nombre: 'Cancha Norte',   direccion: 'Calle Murillo 456, La Paz' },
        ],
      });
      console.log('✅ Campos      : Cancha Central, Cancha Norte\n');

      // ── Equipos ──────────────────────────────────────────────────────────────
      const equipoIds: string[] = [];

      for (let i = 0; i < EQUIPOS.length; i++) {
        const eq = EQUIPOS[i];
        const idx = i + 1; // 1..4

        // Capitán
        const capitan = await tx.usuario.upsert({
          where: { email: `capitan${idx}@demo.com` },
          update: {},
          create: {
            nombre: `Capitán ${eq.nombre}`,
            email: `capitan${idx}@demo.com`,
            passwordHash: hash,
            zona: 'La Paz',
          },
        });

        // Jugadores (4 por equipo → total 5 con el capitán)
        const jugadorIds: string[] = [];
        for (let j = 1; j <= 4; j++) {
          const jugador = await tx.usuario.upsert({
            where: { email: `jugador${idx}.${j}@demo.com` },
            update: {},
            create: {
              nombre: `Jugador ${j} ${eq.nombre}`,
              email: `jugador${idx}.${j}@demo.com`,
              passwordHash: hash,
              zona: 'La Paz',
            },
          });
          jugadorIds.push(jugador.id);
        }

        // Crear equipo
        const equipo = await tx.equipo.create({
          data: {
            torneoId: torneo.id,
            nombre: eq.nombre,
            cantidadJugadores: 5,
            telefonoCapitan: eq.telefono,
          },
        });

        // Inscripción aprobada
        await tx.inscripcion.create({
          data: { torneoId: torneo.id, equipoId: equipo.id, estado: EstadoInscripcion.APROBADA },
        });

        // Vincular capitán
        await tx.usuarioEquipo.create({ data: { usuarioId: capitan.id, equipoId: equipo.id } });
        await tx.usuarioTorneo.create({
          data: { usuarioId: capitan.id, torneoId: torneo.id, rol: RolTorneo.CAPITAN },
        });

        // Vincular jugadores
        for (const jid of jugadorIds) {
          await tx.usuarioEquipo.create({ data: { usuarioId: jid, equipoId: equipo.id } });
          await tx.usuarioTorneo.create({
            data: { usuarioId: jid, torneoId: torneo.id, rol: RolTorneo.JUGADOR },
          });
        }

        equipoIds.push(equipo.id);
        console.log(`  ⚽ ${eq.nombre.padEnd(14)} → capitan${idx}@demo.com  |  jugador${idx}.1..4@demo.com`);
      }

      // ── Fixture (round-robin, sin fecha — listo para programar) ─────────────
      const partidos = generarLiga4(equipoIds);
      await tx.partido.createMany({
        data: partidos.map((p) => ({
          ...p,
          torneoId: torneo.id,
          fecha: null,
          estado: EstadoPartido.PENDIENTE,
        })),
      });

      console.log(`\n✅ Fixture     : ${partidos.length} partidos generados (3 fechas × 2 partidos)`);
      console.log('   Sin horarios asignados — listos para programar desde la app.\n');

      // ── Resumen ──────────────────────────────────────────────────────────────
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏆  DEMO lista — Liga Relámpago 2026');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   Torneo ID   : ${torneo.id}`);
      console.log(`   Estado      : EN_INSCRIPCION (fixture generado, pendiente confirmar)`);
      console.log(`   Contraseña  : ${PASS}  (igual para todos los usuarios)`);
      console.log('');
      console.log('   ROL           EMAIL');
      console.log('   ──────────────────────────────────────────────────────');
      console.log(`   Organizador   organizador@demo.com`);
      for (let i = 1; i <= 4; i++) {
        console.log(`   Capitán ${i}     capitan${i}@demo.com`);
      }
      console.log('   Jugadores     jugador1.1@demo.com … jugador4.4@demo.com');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    },
    { timeout: 60000 },
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
