-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT,
    "instructorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'private',
    "title" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "recurringSeriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lesson_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "RecurringSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lesson" ("createdAt", "endTime", "id", "instructorId", "notes", "recurringSeriesId", "startTime", "status", "studentId", "updatedAt") SELECT "createdAt", "endTime", "id", "instructorId", "notes", "recurringSeriesId", "startTime", "status", "studentId", "updatedAt" FROM "Lesson";
DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE INDEX "Lesson_studentId_idx" ON "Lesson"("studentId");
CREATE INDEX "Lesson_instructorId_idx" ON "Lesson"("instructorId");
CREATE INDEX "Lesson_startTime_idx" ON "Lesson"("startTime");
CREATE INDEX "Lesson_recurringSeriesId_idx" ON "Lesson"("recurringSeriesId");
CREATE TABLE "new_RecurringSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT,
    "instructorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'private',
    "title" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "generatedUntil" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringSeries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringSeries_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecurringSeries" ("active", "createdAt", "dayOfWeek", "endTime", "generatedUntil", "id", "instructorId", "startTime", "studentId") SELECT "active", "createdAt", "dayOfWeek", "endTime", "generatedUntil", "id", "instructorId", "startTime", "studentId" FROM "RecurringSeries";
DROP TABLE "RecurringSeries";
ALTER TABLE "new_RecurringSeries" RENAME TO "RecurringSeries";
CREATE INDEX "RecurringSeries_studentId_idx" ON "RecurringSeries"("studentId");
CREATE INDEX "RecurringSeries_instructorId_idx" ON "RecurringSeries"("instructorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
