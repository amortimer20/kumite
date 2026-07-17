-- CreateTable
CREATE TABLE "BusinessHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayOfWeek" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT NOT NULL DEFAULT '09:00',
    "closeTime" TEXT NOT NULL DEFAULT '20:00'
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHours_dayOfWeek_key" ON "BusinessHours"("dayOfWeek");
