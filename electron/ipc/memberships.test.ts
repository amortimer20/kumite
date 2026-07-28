import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const {
  addMembershipUsageAdjustment,
  assignMembership,
  cancelActiveMembershipForStudent,
  cancelMembership,
  deleteMembershipPayment,
  deleteMembershipPlan,
  getMembershipForStudent,
  recordMembershipPayment,
} = await import('./memberships.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

async function makeStudent() {
  return mockPrisma.student.create({ data: { firstName: 'Maya', lastName: 'Chen' } })
}

async function makePlan(overrides: { includedPrivateLessons?: number } = {}) {
  return mockPrisma.membershipPlan.create({
    data: { title: 'Unlimited Group', priceCents: 8000, includedPrivateLessons: overrides.includedPrivateLessons ?? 0 },
  })
}

describe('assignMembership', () => {
  it('throws if the student already has an active membership', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    await expect(
      assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() }),
    ).rejects.toThrow('already has an active membership')
  })

  it('succeeds for a student with no active membership', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    expect(membership.studentId).toBe(student.id)
    expect(membership.planId).toBe(plan.id)
    expect(membership.active).toBe(true)
  })
})

describe('recordMembershipPayment', () => {
  it('rejects a non-positive amount', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    await expect(
      recordMembershipPayment(membership.id, { amountCents: 0, paidOn: new Date().toISOString() }),
    ).rejects.toThrow('Payment amount must be greater than zero.')
  })

  it('a payment matching the plan price clears the balance', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    const updated = await recordMembershipPayment(membership.id, {
      amountCents: 8000,
      paidOn: new Date().toISOString(),
    })
    expect(updated.amountOwedCents).toBe(0)
    expect(updated.status).toBe('ok')
  })

  // The scenario the balance model exists to fix: splitting a period's
  // payment into installments used to only show correctly if staff manually
  // shortened a coversUntil date. Now it just works off the amounts alone.
  it('a split payment leaves the remainder owed until the second half is paid', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })

    const afterFirstHalf = await recordMembershipPayment(membership.id, {
      amountCents: 4000,
      paidOn: new Date().toISOString(),
    })
    expect(afterFirstHalf.amountOwedCents).toBe(4000)
    expect(afterFirstHalf.status).toBe('overdue')

    const afterSecondHalf = await recordMembershipPayment(membership.id, {
      amountCents: 4000,
      paidOn: new Date().toISOString(),
    })
    expect(afterSecondHalf.amountOwedCents).toBe(0)
    expect(afterSecondHalf.status).toBe('ok')
  })
})

describe('deleteMembershipPayment', () => {
  it('recomputes the balance after removing the only payment', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    const withPayment = await recordMembershipPayment(membership.id, {
      amountCents: 8000,
      paidOn: new Date().toISOString(),
    })
    expect(withPayment.payments.length).toBe(1)
    expect(withPayment.amountOwedCents).toBe(0)

    const afterDelete = await deleteMembershipPayment(withPayment.payments[0].id)
    expect(afterDelete.payments.length).toBe(0)
    expect(afterDelete.amountOwedCents).toBe(8000)
    expect(afterDelete.status).toBe('overdue')
  })
})

describe('addMembershipUsageAdjustment', () => {
  it('a positive delta (bonus lesson) reduces used and increases remaining', async () => {
    const student = await makeStudent()
    const plan = await makePlan({ includedPrivateLessons: 2 })
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    const instructor = await mockPrisma.instructor.create({ data: { firstName: 'Sam', lastName: 'Rivera' } })
    await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + 30 * 60_000),
      },
    })

    const before = await getMembershipForStudent(student.id)
    expect(before!.privateLessonsUsed).toBe(1)

    const after = await addMembershipUsageAdjustment(membership.id, { delta: 1, reason: 'bonus lesson' })
    expect(after.privateLessonsUsed).toBe(0)
    expect(after.privateLessonsRemaining).toBe(2)
  })
})

describe('cancelMembership / cancelActiveMembershipForStudent', () => {
  it('cancelMembership soft-cancels without deleting billing history', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    await recordMembershipPayment(membership.id, {
      amountCents: 8000,
      paidOn: new Date().toISOString(),
    })

    await cancelMembership(membership.id)

    const row = await mockPrisma.studentMembership.findUniqueOrThrow({
      where: { id: membership.id },
      include: { payments: true },
    })
    expect(row.active).toBe(false)
    expect(row.payments.length).toBe(1)
  })

  it('cancelActiveMembershipForStudent only cancels that student\'s membership', async () => {
    const student = await makeStudent()
    const otherStudent = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    const otherMembership = await assignMembership(otherStudent.id, { planId: plan.id, startDate: new Date().toISOString() })

    await cancelActiveMembershipForStudent(student.id)

    const row = await mockPrisma.studentMembership.findUniqueOrThrow({ where: { id: membership.id } })
    const otherRow = await mockPrisma.studentMembership.findUniqueOrThrow({ where: { id: otherMembership.id } })
    expect(row.active).toBe(false)
    expect(otherRow.active).toBe(true)
  })
})

describe('deleteMembershipPlan', () => {
  it('hard-deletes a plan with no students ever assigned', async () => {
    const plan = await makePlan()
    const result = await deleteMembershipPlan(plan.id)
    expect(result.archived).toBe(false)
    const row = await mockPrisma.membershipPlan.findUnique({ where: { id: plan.id } })
    expect(row).toBeNull()
  })

  it('archives instead of deleting when a student is currently on the plan', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })

    const result = await deleteMembershipPlan(plan.id)
    expect(result.archived).toBe(true)
    const row = await mockPrisma.membershipPlan.findUniqueOrThrow({ where: { id: plan.id } })
    expect(row.active).toBe(false)
  })
})
