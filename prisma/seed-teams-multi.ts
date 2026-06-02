import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PASS = 'Password123';

const EQUIPOS = [
  'Los Tigres FC',
  'Rayo Sucre',
  'Sporting La Paz',
  'Real Cochabamba',
  'Bolívar SC',
];

async function main() {
  const hash = await bcrypt.hash(PASS, 10);

  console.log('🌱 Creando 5 equipos con 13 jugadores cada uno + 10 usuarios sueltos...\n');

  await prisma.$transaction(
    async (tx) => {
      let usuarioCount = 0;
      let capitanCount = 0;
      let sueltoCount = 0;

      // ── Crear equipos ────────────────────────────────────────────────────────────
      for (let i = 0; i < EQUIPOS.length; i++) {
        const nombreEquipo = EQUIPOS[i];
        const equipoNum = i + 1;

        console.log(`\n📋 Creando equipo ${equipoNum}: ${nombreEquipo}`);

        // Capitán
        capitanCount++;
        const capitanEmail = `capitan${capitanCount}@tourneyfc.com`;
        const capitan = await tx.usuario.upsert({
          where: { email: capitanEmail },
          update: {},
          create: {
            nombre: `Capitán ${nombreEquipo}`,
            email: capitanEmail,
            passwordHash: hash,
            zona: 'La Paz',
          },
        });
        console.log(`  ✅ Capitán: ${capitanEmail}`);

        // Jugadores (12 por equipo)
        const jugadores: any[] = [];
        for (let j = 1; j <= 12; j++) {
          usuarioCount++;
          const jugadorEmail = `jugador${usuarioCount}@tourneyfc.com`;
          const jugador = await tx.usuario.upsert({
            where: { email: jugadorEmail },
            update: {},
            create: {
              nombre: `Jugador ${usuarioCount}`,
              email: jugadorEmail,
              passwordHash: hash,
              zona: 'La Paz',
            },
          });
          jugadores.push(jugador);
        }
        console.log(`  ✅ ${jugadores.length} jugadores creados`);

        // Equipo global
        let equipo = await tx.equipo.findFirst({
          where: { capitanId: capitan.id, nombre: nombreEquipo },
        });

        if (!equipo) {
          equipo = await tx.equipo.create({
            data: {
              nombre: nombreEquipo,
              escudo: `preset_${equipoNum}`,
              telefonoCapitan: '+591 7000000' + equipoNum,
              capitanId: capitan.id,
            },
          });
          console.log(`  ✅ Equipo creado: ${equipo.nombre} (${equipo.id})`);
        } else {
          console.log(`  ℹ️  Equipo ya existía: ${equipo.nombre} (${equipo.id})`);
        }

        // Membresías (capitán + jugadores)
        // El capitán necesita estar en usuarioEquipo para que el backend lo muestre en su lista de equipos
        await tx.usuarioEquipo.upsert({
          where: { usuarioId_equipoId: { usuarioId: capitan.id, equipoId: equipo.id } },
          update: {},
          create: { usuarioId: capitan.id, equipoId: equipo.id },
        });

        for (const jugador of jugadores) {
          await tx.usuarioEquipo.upsert({
            where: { usuarioId_equipoId: { usuarioId: jugador.id, equipoId: equipo.id } },
            update: {},
            create: { usuarioId: jugador.id, equipoId: equipo.id },
          });
        }

        const totalMiembros = await tx.usuarioEquipo.count({
          where: { equipoId: equipo.id },
        });
        console.log(`  ✅ Miembros en equipo (capitán + jugadores): ${totalMiembros}`);
      }

      // ── Crear usuarios sueltos ───────────────────────────────────────────────────
      console.log('\n📋 Creando 10 usuarios sueltos...');
      for (let i = 1; i <= 10; i++) {
        sueltoCount++;
        const sueltoEmail = `suelto${sueltoCount}@tourneyfc.com`;
        await tx.usuario.upsert({
          where: { email: sueltoEmail },
          update: {},
          create: {
            nombre: `Usuario Suelto ${sueltoCount}`,
            email: sueltoEmail,
            passwordHash: hash,
            zona: 'La Paz',
          },
        });
        console.log(`  ✅ Usuario suelto: ${sueltoEmail}`);
      }

      // ── Resumen ─────────────────────────────────────────────────────────────────
      const totalUsuarios = await tx.usuario.count();
      const totalEquipos = await tx.equipo.count();

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏆 Seed completado');
      console.log(`   Equipos creados     : ${totalEquipos}`);
      console.log(`   Total usuarios     : ${totalUsuarios}`);
      console.log(`   Capitanes          : ${capitanCount}`);
      console.log(`   Jugadores en equipos: ${usuarioCount}`);
      console.log(`   Usuarios sueltos   : ${sueltoCount}`);
      console.log(`   Password           : ${PASS} (para todos)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
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
