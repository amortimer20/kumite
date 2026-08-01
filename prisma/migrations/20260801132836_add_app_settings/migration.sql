-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoBackupDirectory" TEXT,
    "autoBackupFrequency" TEXT NOT NULL DEFAULT 'daily',
    "lastAutoBackupAt" DATETIME
);
