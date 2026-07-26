-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "billingFrequency" TEXT NOT NULL DEFAULT 'monthly',
    "priceCents" INTEGER NOT NULL,
    "includedPrivateLessons" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StudentMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "priceOverrideCents" INTEGER,
    "startDate" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MembershipPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentMembershipId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT,
    "paidOn" DATETIME NOT NULL,
    "coversFrom" DATETIME NOT NULL,
    "coversUntil" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipPayment_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "StudentMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MembershipUsageAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentMembershipId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembershipUsageAdjustment_studentMembershipId_fkey" FOREIGN KEY ("studentMembershipId") REFERENCES "StudentMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StudentMembership_studentId_idx" ON "StudentMembership"("studentId");

-- CreateIndex
CREATE INDEX "StudentMembership_planId_idx" ON "StudentMembership"("planId");

-- CreateIndex
CREATE INDEX "MembershipPayment_studentMembershipId_idx" ON "MembershipPayment"("studentMembershipId");

-- CreateIndex
CREATE INDEX "MembershipUsageAdjustment_studentMembershipId_idx" ON "MembershipUsageAdjustment"("studentMembershipId");
