-- DropForeignKey
ALTER TABLE "campos_juego" DROP CONSTRAINT "campos_juego_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "enlaces_invitacion" DROP CONSTRAINT "enlaces_invitacion_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "equipos" DROP CONSTRAINT "equipos_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "inscripciones" DROP CONSTRAINT "inscripciones_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "notificaciones" DROP CONSTRAINT "notificaciones_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "partidos" DROP CONSTRAINT "partidos_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "usuario_torneo" DROP CONSTRAINT "usuario_torneo_torneoId_fkey";

-- AddForeignKey
ALTER TABLE "usuario_torneo" ADD CONSTRAINT "usuario_torneo_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campos_juego" ADD CONSTRAINT "campos_juego_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_invitacion" ADD CONSTRAINT "enlaces_invitacion_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
