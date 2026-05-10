-- AlterTable
ALTER TABLE "staff_pendiente" ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "staff_pendiente" ADD CONSTRAINT "staff_pendiente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
