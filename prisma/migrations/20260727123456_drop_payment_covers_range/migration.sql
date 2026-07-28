/*
  Warnings:

  - You are about to drop the column `coversFrom` on the `MembershipPayment` table. All the data in the column will be lost.
  - You are about to drop the column `coversUntil` on the `MembershipPayment` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MembershipPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentMembershipId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT,
    "paidOn" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipPayment_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "StudentMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MembershipPayment" ("amountCents", "createdAt", "id", "method", "notes", "paidOn", "studentMembershipId") SELECT "amountCents", "createdAt", "id", "method", "notes", "paidOn", "studentMembershipId" FROM "MembershipPayment";
DROP TABLE "MembershipPayment";
ALTER TABLE "new_MembershipPayment" RENAME TO "MembershipPayment";
CREATE INDEX "MembershipPayment_studentMembershipId_idx" ON "MembershipPayment"("studentMembershipId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
