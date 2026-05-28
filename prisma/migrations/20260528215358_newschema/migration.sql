/*
  Warnings:

  - You are about to drop the column `torneoId` on the `enlaces_invitacion` table. All the data in the column will be lost.
  - You are about to drop the column `torneoId` on the `equipos` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[equipoId]` on the table `enlaces_invitacion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[torneoId,equipoId]` on the table `inscripciones` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `equipoId` to the `enlaces_invitacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `capitanId` to the `equipos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `equipos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `equipoId` to the `eventos_partido` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ModalidadFutbol" AS ENUM ('FUTBOL_5', 'FUTBOL_7', 'FUTBOL_11');

-- CreateEnum
CREATE TYPE "FaseJuego" AS ENUM ('PREVIA', 'PRIMER_TIEMPO', 'MEDIO_TIEMPO', 'SEGUNDO_TIEMPO', 'PENALES', 'FINALIZADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEvento" ADD VALUE 'FALTA';
ALTER TYPE "TipoEvento" ADD VALUE 'CORNER';
ALTER TYPE "TipoEvento" ADD VALUE 'PENAL_FALLADO';

-- DropForeignKey
ALTER TABLE "enlaces_invitacion" DROP CONSTRAINT "enlaces_invitacion_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "equipos" DROP CONSTRAINT "equipos_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "eventos_partido" DROP CONSTRAINT "eventos_partido_jugadorId_fkey";

-- DropForeignKey
ALTER TABLE "inscripciones" DROP CONSTRAINT "inscripciones_equipoId_fkey";

-- DropForeignKey
ALTER TABLE "invitaciones_pendientes" DROP CONSTRAINT "invitaciones_pendientes_equipoId_fkey";

-- DropForeignKey
ALTER TABLE "usuario_equipo" DROP CONSTRAINT "usuario_equipo_equipoId_fkey";

-- DropIndex
DROP INDEX "inscripciones_equipoId_key";

-- DropIndex
DROP INDEX "invitaciones_pendientes_torneoId_email_tipo_key";

-- AlterTable
ALTER TABLE "enlaces_invitacion" DROP COLUMN "torneoId",
ADD COLUMN     "equipoId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "equipos" DROP COLUMN "torneoId",
ADD COLUMN     "capitanId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "eventos_partido" ADD COLUMN     "equipoId" TEXT NOT NULL,
ALTER COLUMN "jugadorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invitaciones_pendientes" ALTER COLUMN "torneoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "partidos" ADD COLUMN     "cronometroIniciadoEn" TIMESTAMP(3),
ADD COLUMN     "faseJuego" "FaseJuego" NOT NULL DEFAULT 'PREVIA',
ADD COLUMN     "golesPenalesLocal" INTEGER,
ADD COLUMN     "golesPenalesVisitante" INTEGER,
ADD COLUMN     "minutosJugados" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "torneos" ADD COLUMN     "imagen" TEXT,
ADD COLUMN     "maxJugadoresPorEquipo" INTEGER,
ADD COLUMN     "modalidad" "ModalidadFutbol";

-- CreateTable
CREATE TABLE "inscripcion_roster" (
    "id" TEXT NOT NULL,
    "inscripcionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inscripcion_roster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inscripcion_roster_inscripcionId_usuarioId_key" ON "inscripcion_roster"("inscripcionId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "enlaces_invitacion_equipoId_key" ON "enlaces_invitacion"("equipoId");

-- CreateIndex
CREATE UNIQUE INDEX "inscripciones_torneoId_equipoId_key" ON "inscripciones"("torneoId", "equipoId");

-- CreateIndex
CREATE INDEX "invitaciones_pendientes_email_estado_idx" ON "invitaciones_pendientes"("email", "estado");

-- CreateIndex
CREATE INDEX "invitaciones_pendientes_equipoId_email_estado_idx" ON "invitaciones_pendientes"("equipoId", "email", "estado");

-- CreateIndex
CREATE INDEX "invitaciones_pendientes_torneoId_email_tipo_idx" ON "invitaciones_pendientes"("torneoId", "email", "tipo");

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_capitanId_fkey" FOREIGN KEY ("capitanId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_equipo" ADD CONSTRAINT "usuario_equipo_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion_roster" ADD CONSTRAINT "inscripcion_roster_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "inscripciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion_roster" ADD CONSTRAINT "inscripcion_roster_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_invitacion" ADD CONSTRAINT "enlaces_invitacion_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones_pendientes" ADD CONSTRAINT "invitaciones_pendientes_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
