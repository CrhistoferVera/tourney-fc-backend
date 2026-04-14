/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "RolTorneo" AS ENUM ('ORGANIZADOR', 'CAPITAN', 'STAFF', 'JUGADOR');

-- CreateEnum
CREATE TYPE "EstadoTorneo" AS ENUM ('BORRADOR', 'EN_INSCRIPCION', 'EN_CURSO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "FormatoTorneo" AS ENUM ('LIGA', 'COPA', 'GRUPOS', 'ELIMINATORIA');

-- CreateEnum
CREATE TYPE "EstadoInscripcion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoPartido" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ESPERANDO_CONFIRMACION', 'EN_DISPUTA', 'CONFIRMADO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('GOL', 'ASISTENCIA', 'TARJETA_AMARILLA', 'TARJETA_ROJA', 'CAMBIO');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('PARTIDO_PROGRAMADO', 'RESULTADO_PENDIENTE', 'RESULTADO_CONFIRMADO', 'DISPUTA_ABIERTA', 'DISPUTA_RESUELTA', 'TORNEO_PUBLICADO', 'INSCRIPCION_APROBADA', 'INSCRIPCION_RECHAZADA', 'ROL_ASIGNADO');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fotoPerfil" TEXT,
    "zona" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "torneos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "formato" "FormatoTorneo" NOT NULL,
    "maxEquipos" INTEGER NOT NULL,
    "estado" "EstadoTorneo" NOT NULL DEFAULT 'BORRADOR',
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "zona" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "torneos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_torneo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "rol" "RolTorneo" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_torneo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campos_juego" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campos_juego_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipos" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "escudo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_equipo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscripciones" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "estado" "EstadoInscripcion" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enlaces_invitacion" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "maxUsos" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enlaces_invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partidos" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "campoId" TEXT,
    "equipoLocalId" TEXT NOT NULL,
    "equipoVisitanteId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3),
    "estado" "EstadoPartido" NOT NULL DEFAULT 'PENDIENTE',
    "ronda" INTEGER,
    "fase" TEXT,
    "golesLocal" INTEGER,
    "golesVisitante" INTEGER,
    "confirmadoPorLocal" BOOLEAN NOT NULL DEFAULT false,
    "confirmadoPorVisitante" BOOLEAN NOT NULL DEFAULT false,
    "resultadoDisputado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_partido" (
    "id" TEXT NOT NULL,
    "partidoId" TEXT NOT NULL,
    "jugadorId" TEXT NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "minuto" INTEGER,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_partido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "torneoId" TEXT,
    "tipo" "TipoNotificacion" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_torneo_usuarioId_torneoId_key" ON "usuario_torneo"("usuarioId", "torneoId");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_equipo_usuarioId_equipoId_key" ON "usuario_equipo"("usuarioId", "equipoId");

-- CreateIndex
CREATE UNIQUE INDEX "inscripciones_equipoId_key" ON "inscripciones"("equipoId");

-- CreateIndex
CREATE UNIQUE INDEX "enlaces_invitacion_codigo_key" ON "enlaces_invitacion"("codigo");

-- AddForeignKey
ALTER TABLE "usuario_torneo" ADD CONSTRAINT "usuario_torneo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_torneo" ADD CONSTRAINT "usuario_torneo_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campos_juego" ADD CONSTRAINT "campos_juego_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_equipo" ADD CONSTRAINT "usuario_equipo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_equipo" ADD CONSTRAINT "usuario_equipo_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripciones" ADD CONSTRAINT "inscripciones_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_invitacion" ADD CONSTRAINT "enlaces_invitacion_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_invitacion" ADD CONSTRAINT "enlaces_invitacion_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "campos_juego"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipoLocalId_fkey" FOREIGN KEY ("equipoLocalId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partidos" ADD CONSTRAINT "partidos_equipoVisitanteId_fkey" FOREIGN KEY ("equipoVisitanteId") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_partidoId_fkey" FOREIGN KEY ("partidoId") REFERENCES "partidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_partido" ADD CONSTRAINT "eventos_partido_jugadorId_fkey" FOREIGN KEY ("jugadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
