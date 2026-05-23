-- DropForeignKey
ALTER TABLE "usuario_equipo" DROP CONSTRAINT "usuario_equipo_equipoId_fkey";

-- AlterTable
ALTER TABLE "torneos" ADD COLUMN     "imagen" TEXT;

-- AddForeignKey
ALTER TABLE "usuario_equipo" ADD CONSTRAINT "usuario_equipo_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "equipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
