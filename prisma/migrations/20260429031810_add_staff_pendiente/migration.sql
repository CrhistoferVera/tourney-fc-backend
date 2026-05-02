-- CreateTable
CREATE TABLE "staff_pendiente" (
    "id" TEXT NOT NULL,
    "torneoId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_pendiente_torneoId_email_key" ON "staff_pendiente"("torneoId", "email");

-- AddForeignKey
ALTER TABLE "staff_pendiente" ADD CONSTRAINT "staff_pendiente_torneoId_fkey" FOREIGN KEY ("torneoId") REFERENCES "torneos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
