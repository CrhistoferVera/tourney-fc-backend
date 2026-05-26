/**
 * Limpia todos los datos generados por seed-liga-demo y seed-copa-demo.
 * Identifica usuarios por dominio @demo.com y elimina en cascada.
 *
 * USO:  npm run seed:clean
 */
import { PrismaClient, RolTorneo } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🧹  Iniciando limpieza de datos demo (@demo.com)...\n');

  // ── 1. Encontrar todos los usuarios demo ─────────────────────────────────────
  const demoUsers = await prisma.usuario.findMany({
    where: { email: { endsWith: '@demo.com' } },
    select: { id: true, email: true },
  });

  if (demoUsers.length === 0) {
    console.log('ℹ️  No se encontraron usuarios @demo.com. Nada que limpiar.');
    return;
  }

  const demoUserIds = demoUsers.map((u) => u.id);
  const demoEmails = demoUsers.map((u) => u.email);
  console.log(`   Usuarios encontrados : ${demoUsers.length}`);

  // ── 2. Encontrar torneos organizados por usuarios demo ────────────────────────
  const orgRoles = await prisma.usuarioTorneo.findMany({
    where: { usuarioId: { in: demoUserIds }, rol: RolTorneo.ORGANIZADOR },
    select: { torneoId: true },
  });
  const demoTorneoIds = [...new Set(orgRoles.map((r) => r.torneoId))];
  console.log(`   Torneos encontrados  : ${demoTorneoIds.length}`);

  if (demoTorneoIds.length === 0) {
    console.log('\n⚠️  Los usuarios demo no tienen torneos como organizador.');
    console.log('   Se procederá a limpiar solo los usuarios.\n');
  }

  // ── 3. Eliminar eventos_partido manualmente (no tiene cascade desde equipo) ────
  // eventos_partido.equipoId → equipos (sin onDelete: Cascade) → bloquea la cadena
  if (demoTorneoIds.length > 0) {
    const demoPartidos = await prisma.partido.findMany({
      where: { torneoId: { in: demoTorneoIds } },
      select: { id: true },
    });
    const demoPartidoIds = demoPartidos.map((p) => p.id);

    if (demoPartidoIds.length > 0) {
      const { count: eventos } = await prisma.eventoPartido.deleteMany({
        where: { partidoId: { in: demoPartidoIds } },
      });
      if (eventos > 0) console.log(`\n   ✅ Eventos de partido eliminados: ${eventos}`);
    }
  }

  // ── 4. Eliminar torneos (cascade automático en BD) ────────────────────────────
  // inscripciones, campos_juego, usuario_torneo, partidos,
  // notificaciones (por torneo), enlaces_invitacion, invitaciones_pendientes
  // → equipos → usuario_equipo
  if (demoTorneoIds.length > 0) {
    const { count: torneos } = await prisma.torneo.deleteMany({
      where: { id: { in: demoTorneoIds } },
    });
    console.log(`   ✅ Torneos eliminados           : ${torneos}`);
  }

  // ── 5. Limpiar relaciones de usuario que no caen en cascade ──────────────────
  // Notificaciones sin torneoId (si quedara alguna)
  const { count: notifs } = await prisma.notificacion.deleteMany({
    where: { usuarioId: { in: demoUserIds } },
  });
  if (notifs > 0) console.log(`   ✅ Notificaciones eliminadas    : ${notifs}`);

  // EnlacesInvitacion sin torneo (creados por usuarios demo)
  const { count: enlaces } = await prisma.enlaceInvitacion.deleteMany({
    where: { creadoPor: { in: demoUserIds } },
  });
  if (enlaces > 0) console.log(`   ✅ Enlaces invitación eliminados: ${enlaces}`);

  // Registros de reset-password por email
  const { count: resets } = await prisma.resetPassword.deleteMany({
    where: { email: { in: demoEmails } },
  });
  if (resets > 0) console.log(`   ✅ Reset-password eliminados    : ${resets}`);

  // ── 6. Eliminar usuarios demo ─────────────────────────────────────────────────
  const { count: usuarios } = await prisma.usuario.deleteMany({
    where: { id: { in: demoUserIds } },
  });
  console.log(`   ✅ Usuarios eliminados          : ${usuarios}`);

  // ── Resumen ───────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️   Limpieza completada — datos demo eliminados');
  console.log(`     Torneos : ${demoTorneoIds.length}   Usuarios : ${usuarios}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
