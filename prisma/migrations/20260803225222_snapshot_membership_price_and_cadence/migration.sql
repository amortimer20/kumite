-- Snapshots each membership's billed price and billing cadence onto the
-- membership itself, so editing a plan no longer retroactively re-bills every
-- student on it. Existing rows are backfilled from their current plan, which
-- reproduces exactly what the balance math was already using for them — so
-- this migration does not change any student's balance.
--
-- The INSERT below was hand-edited from Prisma's generated version: the
-- generated one omitted the two new NOT NULL columns, which cannot work on a
-- non-empty table. LEFT JOIN rather than JOIN so that a membership whose plan
-- is somehow missing is still carried over instead of being silently dropped
-- (the foreign key should make that impossible, but losing membership rows here
-- would be unrecoverable).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudentMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "priceOverrideCents" INTEGER,
    "billedPriceCents" INTEGER NOT NULL,
    "billingFrequency" TEXT NOT NULL,
    "priorChargesCents" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentMembership" ("active", "createdAt", "id", "planId", "priceOverrideCents", "startDate", "studentId", "billedPriceCents", "billingFrequency")
SELECT
    sm."active",
    sm."createdAt",
    sm."id",
    sm."planId",
    sm."priceOverrideCents",
    sm."startDate",
    sm."studentId",
    COALESCE(p."priceCents", 0),
    COALESCE(p."billingFrequency", 'monthly')
FROM "StudentMembership" sm
LEFT JOIN "MembershipPlan" p ON p."id" = sm."planId";
DROP TABLE "StudentMembership";
ALTER TABLE "new_StudentMembership" RENAME TO "StudentMembership";
CREATE INDEX "StudentMembership_studentId_idx" ON "StudentMembership"("studentId");
CREATE INDEX "StudentMembership_planId_idx" ON "StudentMembership"("planId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
