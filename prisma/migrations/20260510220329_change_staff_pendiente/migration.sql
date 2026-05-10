/*
  Warnings:

  - You are about to drop the `staff_pendiente` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoInvitacion" AS ENUM ('STAFF', 'JUGADOR');

-- CreateEnum
CREATE TYPE "EstadoInvitacion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- DropForeignKey
ALTER TABLE "staff_pendiente" DROP CONSTRAINT "staff_pendiente_torneoId_fkey";

-- DropForeignKey
ALTER TABLE "staff_pendiente" DROP CONSTRAINT "staff_pendiente_userId_fkey";

-- DropTable
DROP TABLE "staff_pendiente";

-- CreateTable
CREATE TABLE "invitaciones_pendientes" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "equipoId" TEXT,
    "tipo" "TipoInvitacion" NOT NULL,
    "estado" "EstadoInvitacion" NOT NULL DEFAULT 'PENDIENTE',
    "email" TEXT NOT NULL,
    "invitadoPor" TEXT NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitaciones_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_pendientes_torneoId_email_tipo_key" ON "invitaciones_pendientes"("torneoId", "email", "tipo");

-- AddForeignKey
ALTER TABLE "invitaciones_pendientes" ADD CONSTRAINT "invitaciones_pendientes_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones_pendientes" ADD CONSTRAINT "invitaciones_pendientes_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones_pendientes" ADD CONSTRAINT "invitaciones_pendientes_invitadoPor_fkey" FOREIGN KEY ("invitadoPor") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones_pendientes" ADD CONSTRAINT "invitaciones_pendientes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
