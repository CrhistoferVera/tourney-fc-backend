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

// Copa eliminatoria — solo genera la primera ronda (Semifinal).
// Las rondas siguientes aparecen como "Por definir" en el bracket
// hasta que se ingresen los resultados.
function generarCopa4(ids: string[]) {
  // Mezclar aleatoriamente para emparejar equipos
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  const [a, b, c, d] = shuffled;
  return [
    { equipoLocalId: a, equipoVisitanteId: b, ronda: 1, fase: 'Semifinal' },
    { equipoLocalId: c, equipoVisitanteId: d, ronda: 1, fase: 'Semifinal' },
  ];
}

const EQUIPOS = [
  { nombre: 'Rayos del Sur', telefono: '72000001' },
  { nombre: 'Dragones FC',   telefono: '72000002' },
  { nombre: 'Panteras EC',   telefono: '72000003' },
  { nombre: 'Búhos SC',      telefono: '72000004' },
];

const PASS = 'Demo1234';

async function main() {
  const hash = await bcrypt.hash(PASS, 10);

  console.log('🌱  Iniciando seed — Copa Demo 4 equipos...\n');

  await prisma.$transaction(
    async (tx) => {
      // ── Organizador (compartido con el seed liga-demo) ───────────────────────
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
          nombre: 'Copa Eliminatoria Demo 2026',
          descripcion: 'Torneo de demostración — 4 equipos, formato copa, eliminación directa.',
          formato: FormatoTorneo.COPA,
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
          { torneoId: torneo.id, nombre: 'Estadio Demo',  direccion: 'Av. Arce 789, La Paz' },
          { torneoId: torneo.id, nombre: 'Cancha Alterna', direccion: 'Calle Potosí 101, La Paz' },
        ],
      });
      console.log('✅ Campos      : Estadio Demo, Cancha Alterna\n');

      // ── Equipos ──────────────────────────────────────────────────────────────
      const equipoIds: string[] = [];

      for (let i = 0; i < EQUIPOS.length; i++) {
        const eq = EQUIPOS[i];
        const idx = i + 1; // 1..4

        // Capitán — prefijo "copa" para no colisionar con seed-liga-demo
        const capitan = await tx.usuario.upsert({
          where: { email: `capitan-copa${idx}@demo.com` },
          update: {},
          create: {
            nombre: `Capitán ${eq.nombre}`,
            email: `capitan-copa${idx}@demo.com`,
            passwordHash: hash,
            zona: 'La Paz',
          },
        });

        // Jugadores (4 por equipo → total 5 con el capitán)
        const jugadorIds: string[] = [];
        for (let j = 1; j <= 4; j++) {
          const jugador = await tx.usuario.upsert({
            where: { email: `jugador-copa${idx}.${j}@demo.com` },
            update: {},
            create: {
              nombre: `Jugador ${j} ${eq.nombre}`,
              email: `jugador-copa${idx}.${j}@demo.com`,
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
        console.log(
          `  ⚽ ${eq.nombre.padEnd(14)} → capitan-copa${idx}@demo.com  |  jugador-copa${idx}.1..4@demo.com`,
        );
      }

      // ── Fixture Copa — Semifinal (solo ronda 1) ──────────────────────────────
      // La ronda 2 (Final) se generará automáticamente al ingresar resultados.
      const partidos = generarCopa4(equipoIds);
      await tx.partido.createMany({
        data: partidos.map((p) => ({
          ...p,
          torneoId: torneo.id,
          fecha: null,
          estado: EstadoPartido.PENDIENTE,
        })),
      });

      console.log(`\n✅ Fixture     : ${partidos.length} partidos generados (Semifinal)`);
      console.log('   Sin horarios asignados — listos para programar desde la app.');
      console.log('   La Final aparecerá como "Por definir" en el bracket.\n');

      // ── Resumen ──────────────────────────────────────────────────────────────
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏆  DEMO lista — Copa Eliminatoria 2026');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   Torneo ID   : ${torneo.id}`);
      console.log(`   Estado      : EN_INSCRIPCION (fixture semifinal generado)`);
      console.log(`   Contraseña  : ${PASS}  (igual para todos)`);
      console.log('');
      console.log('   ROL           EMAIL');
      console.log('   ──────────────────────────────────────────────────────');
      console.log('   Organizador   organizador@demo.com');
      for (let i = 1; i <= 4; i++) {
        console.log(`   Capitán ${i}     capitan-copa${i}@demo.com`);
      }
      console.log('   Jugadores     jugador-copa1.1@demo.com … jugador-copa4.4@demo.com');
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
