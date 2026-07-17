/*
  Warnings:

  - You are about to drop the column `notes` on the `RecurringSeries` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecurringSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "generatedUntil" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringSeries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecurringSeries" ("active", "createdAt", "dayOfWeek", "endTime", "generatedUntil", "id", "instructorId", "startTime", "studentId") SELECT "active", "createdAt", "dayOfWeek", "endTime", "generatedUntil", "id", "instructorId", "startTime", "studentId" FROM "RecurringSeries";
DROP TABLE "RecurringSeries";
ALTER TABLE "new_RecurringSeries" RENAME TO "RecurringSeries";
CREATE INDEX "RecurringSeries_studentId_idx" ON "RecurringSeries"("studentId");
CREATE INDEX "RecurringSeries_instructorId_idx" ON "RecurringSeries"("instructorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
