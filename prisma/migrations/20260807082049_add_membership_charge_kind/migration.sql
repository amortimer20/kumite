-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MembershipCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentMembershipId" TEXT NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "priceCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'period',
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipCharge_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "StudentMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MembershipCharge" ("createdAt", "id", "label", "periodEnd", "periodStart", "priceCents", "studentMembershipId") SELECT "createdAt", "id", "label", "periodEnd", "periodStart", "priceCents", "studentMembershipId" FROM "MembershipCharge";
DROP TABLE "MembershipCharge";
ALTER TABLE "new_MembershipCharge" RENAME TO "MembershipCharge";
CREATE INDEX "MembershipCharge_studentMembershipId_idx" ON "MembershipCharge"("studentMembershipId");
CREATE UNIQUE INDEX "MembershipCharge_studentMembershipId_periodStart_key" ON "MembershipCharge"("studentMembershipId", "periodStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
