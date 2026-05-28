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
const TEAM_NAME = 'Los Tigres FC';
const TEAM_PHONE = '+591 70000000';
const TEAM_ESCUDO = 'preset_3';

const CAPITAN = {
  nombre: 'Capitán Tigres',
  email: 'capitan.tigres@tourneyfc.com',
};

const JUGADORES = [
  { nombre: 'Marco Suárez', email: 'marco.suarez@tourneyfc.com' },
  { nombre: 'Diego Rojas', email: 'diego.rojas@tourneyfc.com' },
  { nombre: 'Iván Quispe', email: 'ivan.quispe@tourneyfc.com' },
  { nombre: 'Pablo Mendoza', email: 'pablo.mendoza@tourneyfc.com' },
  { nombre: 'Luis Cárdenas', email: 'luis.cardenas@tourneyfc.com' },
  { nombre: 'Andrés Vargas', email: 'andres.vargas@tourneyfc.com' },
  { nombre: 'Sergio Flores', email: 'sergio.flores@tourneyfc.com' },
  { nombre: 'Ricardo Limachi', email: 'ricardo.limachi@tourneyfc.com' },
  { nombre: 'Javier Núñez', email: 'javier.nunez@tourneyfc.com' },
  { nombre: 'Tomás Aramayo', email: 'tomas.aramayo@tourneyfc.com' },
];

async function main() {
  const hash = await bcrypt.hash(PASS, 10);

  console.log('🌱 Creando equipo de 11 jugadores...\n');

  await prisma.$transaction(
    async (tx) => {
      // ── Capitán ────────────────────────────────────────────────────────────
      const capitan = await tx.usuario.upsert({
        where: { email: CAPITAN.email },
        update: {},
        create: {
          nombre: CAPITAN.nombre,
          email: CAPITAN.email,
          passwordHash: hash,
          zona: 'La Paz',
        },
      });
      console.log(`✅ Capitán: ${capitan.email}`);

      // ── Jugadores ──────────────────────────────────────────────────────────
      const jugadores = await Promise.all(
        JUGADORES.map((j) =>
          tx.usuario.upsert({
            where: { email: j.email },
            update: {},
            create: {
              nombre: j.nombre,
              email: j.email,
              passwordHash: hash,
              zona: 'La Paz',
            },
          }),
        ),
      );
      console.log(`✅ ${jugadores.length} jugadores creados`);

      // ── Equipo global ──────────────────────────────────────────────────────
      // Buscar si ya existe un equipo del capitán con este nombre
      let equipo = await tx.equipo.findFirst({
        where: { capitanId: capitan.id, nombre: TEAM_NAME },
      });

      if (!equipo) {
        equipo = await tx.equipo.create({
          data: {
            nombre: TEAM_NAME,
            escudo: TEAM_ESCUDO,
            telefonoCapitan: TEAM_PHONE,
            capitanId: capitan.id,
          },
        });
        console.log(`✅ Equipo creado: ${equipo.nombre} (${equipo.id})`);
      } else {
        console.log(`ℹ️  Equipo ya existía: ${equipo.nombre} (${equipo.id})`);
      }

      // ── Membresías (capitán + jugadores) ───────────────────────────────────
      const todos = [capitan.id, ...jugadores.map((j) => j.id)];
      for (const usuarioId of todos) {
        await tx.usuarioEquipo.upsert({
          where: { usuarioId_equipoId: { usuarioId, equipoId: equipo.id } },
          update: {},
          create: { usuarioId, equipoId: equipo.id },
        });
      }

      const totalMiembros = await tx.usuarioEquipo.count({
        where: { equipoId: equipo.id },
      });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏆 Seed equipo completado');
      console.log(`   Equipo    : ${equipo.nombre}`);
      console.log(`   ID        : ${equipo.id}`);
      console.log(`   Jugadores : ${totalMiembros}`);
      console.log(`   Capitán   : ${capitan.email} / ${PASS}`);
      console.log(`   Jugadores : password = ${PASS} (mismo para todos)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    },
    { timeout: 30000 },
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
