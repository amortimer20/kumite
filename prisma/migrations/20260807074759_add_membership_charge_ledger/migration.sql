-- CreateTable
CREATE TABLE "MembershipCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentMembershipId" TEXT NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "priceCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipCharge_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "StudentMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MembershipCharge_studentMembershipId_idx" ON "MembershipCharge"("studentMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCharge_studentMembershipId_periodStart_key" ON "MembershipCharge"("studentMembershipId", "periodStart");
