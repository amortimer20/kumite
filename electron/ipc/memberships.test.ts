import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'
import { currentPeriodBounds } from '../membershipLogic.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const {
  addMembershipUsageAdjustment,
  applyPlanTermsToActiveMemberships,
  assignMembership,
  cancelActiveMembershipForStudent,
  cancelMembership,
  chargeExtraLesson,
  deleteMembershipPayment,
  deleteMembershipPlan,
  getMembershipForStudent,
  getPaymentHistoryForStudent,
  recordMembershipPayment,
  updateMembership,
  updateMembershipPlan,
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

  // Non-traditional membership fees: a mid-month sign-up's prorated first
  // partial month, materialized as a one-off charge alongside the first real
  // period (started "now", so exactly one period has already elapsed).
  describe('with a proration stub', () => {
    it('materializes it as a one-off charge on top of the first period', async () => {
      const student = await makeStudent()
      const plan = await mockPrisma.membershipPlan.create({
        data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
      })
      const membership = await assignMembership(student.id, {
        planId: plan.id,
        startDate: new Date().toISOString(),
        prorationStubCents: 3_871,
      })

      expect(membership.amountOwedCents).toBe(3_871 + 10_000) // stub + the first full period

      const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
      const stub = charges.find((c) => c.kind === 'proration')
      expect(stub?.priceCents).toBe(3_871)
      expect(stub?.periodStart).toBeNull() // a one-off, not tied to a real period
      expect(stub?.label).toBe('Prorated first month')
    })

    it('rejects a non-positive amount', async () => {
      const student = await makeStudent()
      const plan = await makePlan()
      await expect(
        assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString(), prorationStubCents: 0 }),
      ).rejects.toThrow('greater than zero')
    })

    it('creates no stub when omitted, same as before this feature existed', async () => {
      const student = await makeStudent()
      const plan = await makePlan()
      const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
      const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
      expect(charges.some((c) => c.kind === 'proration')).toBe(false)
    })
  })
})

// The paid-extra-lesson flow: a charge, a matching payment, and a usage
// allowance, all in one call.
describe('chargeExtraLesson', () => {
  it('charges the price, records a matching payment, and grants the lesson allowance atomically', async () => {
    const student = await makeStudent()
    const plan = await makePlan({ includedPrivateLessons: 4 })
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    // Paid up on dues before the extra lesson, so any change afterward is
    // attributable to the extra lesson alone.
    await recordMembershipPayment(membership.id, { amountCents: 8_000, paidOn: new Date().toISOString() })
    const before = await getMembershipForStudent(student.id)
    expect(before?.amountOwedCents).toBe(0)
    expect(before?.privateLessonsRemaining).toBe(4)

    const updated = await chargeExtraLesson(membership.id, {
      priceCents: 5_000,
      lessonCount: 2,
      paidOn: new Date().toISOString(),
      method: 'cash',
      notes: null,
    })

    // The charge and its payment are for the same amount, so dues owed is
    // unaffected — this tops up the lesson allowance, it doesn't change what's
    // owed for membership dues.
    expect(updated.amountOwedCents).toBe(0)
    expect(updated.privateLessonsRemaining).toBe(6) // 4 included + 2 extra
  })

  it('records the payment so it shows up in payment history', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })

    await chargeExtraLesson(membership.id, {
      priceCents: 3_000,
      lessonCount: 1,
      paidOn: new Date().toISOString(),
      method: 'card',
      notes: 'extra Saturday lesson',
    })

    const history = await getPaymentHistoryForStudent(student.id)
    expect(history.some((p) => p.amountCents === 3_000 && p.method === 'card')).toBe(true)
  })

  it('pre-fills lastExtraLessonPriceCents from the most recent extra-lesson charge', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    expect((await getMembershipForStudent(student.id))?.lastExtraLessonPriceCents).toBeNull()

    await chargeExtraLesson(membership.id, { priceCents: 4_000, lessonCount: 1, paidOn: new Date().toISOString() })
    expect((await getMembershipForStudent(student.id))?.lastExtraLessonPriceCents).toBe(4_000)

    await chargeExtraLesson(membership.id, { priceCents: 6_000, lessonCount: 1, paidOn: new Date().toISOString() })
    expect((await getMembershipForStudent(student.id))?.lastExtraLessonPriceCents).toBe(6_000)
  })

  it('rejects a non-positive price', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    await expect(
      chargeExtraLesson(membership.id, { priceCents: 0, lessonCount: 1, paidOn: new Date().toISOString() }),
    ).rejects.toThrow('greater than zero')
  })

  it('rejects a non-positive or fractional lesson count', async () => {
    const student = await makeStudent()
    const plan = await makePlan()
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: new Date().toISOString() })
    await expect(
      chargeExtraLesson(membership.id, { priceCents: 5_000, lessonCount: 0, paidOn: new Date().toISOString() }),
    ).rejects.toThrow('at least 1')
    await expect(
      chargeExtraLesson(membership.id, { priceCents: 5_000, lessonCount: 1.5, paidOn: new Date().toISOString() }),
    ).rejects.toThrow('at least 1')
  })
})

const DAY_MS = 86_400_000

// Regression tests for the pre-beta review's worst money bug. The balance is
// recomputed from startDate on every read, so when it read the plan's *current*
// price and cadence, editing a plan silently rewrote every past period for
// every student on it.
describe('plan edits do not re-bill existing memberships', () => {
  it('raising a plan price leaves a paid-up member paid up', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    // Joined 3 months ago and has paid every month since.
    const startDate = new Date(Date.now() - 70 * DAY_MS)
    const membership = await assignMembership(student.id, {
      planId: plan.id,
      startDate: startDate.toISOString(),
    })
    for (let i = 0; i < 3; i++) {
      await recordMembershipPayment(membership.id, { amountCents: 10_000, paidOn: new Date().toISOString() })
    }
    const before = await getMembershipForStudent(student.id)
    expect(before?.amountOwedCents).toBe(0)

    // The studio raises the price for new sign-ups.
    await updateMembershipPlan(plan.id, { priceCents: 12_000 })

    const after = await getMembershipForStudent(student.id)
    // Previously: 3 elapsed periods x the NEW $120 = $360 charged against $300
    // paid, so this student suddenly owed $60 and flipped to overdue.
    expect(after?.amountOwedCents).toBe(0)
    expect(after?.status).not.toBe('overdue')
    // They keep billing at what they signed up at.
    expect(after?.effectivePriceCents).toBe(10_000)
    // The plan itself did change, for anyone assigned to it from now on.
    expect(after?.plan.priceCents).toBe(12_000)
  })

  it('changing a plan cadence does not recount an existing member\'s history', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const membership = await assignMembership(student.id, {
      planId: plan.id,
      startDate: new Date(Date.now() - 70 * DAY_MS).toISOString(),
    })
    for (let i = 0; i < 3; i++) {
      await recordMembershipPayment(membership.id, { amountCents: 10_000, paidOn: new Date().toISOString() })
    }

    await updateMembershipPlan(plan.id, { billingFrequency: 'weekly' })

    const after = await getMembershipForStudent(student.id)
    // Previously: ~10 weekly periods x $100 = $1,000 charged against $300 paid.
    expect(after?.amountOwedCents).toBe(0)
    expect(after?.billingFrequency).toBe('monthly')
  })

  it('a new sign-up after a price rise gets the new price', async () => {
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    await updateMembershipPlan(plan.id, { priceCents: 12_000 })

    const newStudent = await makeStudent()
    const membership = await assignMembership(newStudent.id, {
      planId: plan.id,
      startDate: new Date().toISOString(),
    })
    expect(membership.effectivePriceCents).toBe(12_000)
    expect(membership.amountOwedCents).toBe(12_000)
  })
})

describe('switching plans across billing cadences', () => {
  it('does not turn past payments into free future periods', async () => {
    const student = await makeStudent()
    const monthly = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const weekly = await mockPrisma.membershipPlan.create({
      data: { title: 'Weekly', billingFrequency: 'weekly', priceCents: 5_000 },
    })

    // Six months in, paid in full the whole way.
    const membership = await assignMembership(student.id, {
      planId: monthly.id,
      startDate: new Date(Date.now() - 160 * DAY_MS).toISOString(),
    })
    const paidUp = await getMembershipForStudent(student.id)
    const periodsSoFar = paidUp!.amountOwedCents / 10_000
    for (let i = 0; i < periodsSoFar; i++) {
      await recordMembershipPayment(membership.id, { amountCents: 10_000, paidOn: new Date().toISOString() })
    }
    expect((await getMembershipForStudent(student.id))?.amountOwedCents).toBe(0)

    await updateMembership(membership.id, { planId: weekly.id })

    const after = await getMembershipForStudent(student.id)
    // The anchor resets to today for the new weekly cadence, so exactly one
    // weekly period is now owed. Previously the months of monthly payments were
    // re-read as credit against $50/week, handing out ~14 free weeks.
    expect(after?.billingFrequency).toBe('weekly')
    expect(after?.effectivePriceCents).toBe(5_000)
    expect(after?.amountOwedCents).toBe(5_000)
  })

  it('carries an unpaid balance forward instead of clearing it', async () => {
    const student = await makeStudent()
    const monthly = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const weekly = await mockPrisma.membershipPlan.create({
      data: { title: 'Weekly', billingFrequency: 'weekly', priceCents: 5_000 },
    })

    // Two monthly periods elapsed, nothing paid — $200 owed.
    const membership = await assignMembership(student.id, {
      planId: monthly.id,
      startDate: new Date(Date.now() - 40 * DAY_MS).toISOString(),
    })
    const owedBefore = (await getMembershipForStudent(student.id))!.amountOwedCents
    expect(owedBefore).toBe(20_000)

    await updateMembership(membership.id, { planId: weekly.id })

    const after = await getMembershipForStudent(student.id)
    // The old debt survives the switch, plus the first week on the new plan.
    expect(after?.amountOwedCents).toBe(owedBefore + 5_000)
  })
})

// The opt-in escape hatch from grandfathering: raising a plan's price and
// choosing to apply it to the students already on it. The guarantee is "new
// price from the next billing date," never a rewrite of the past.
describe('applyPlanTermsToActiveMemberships', () => {
  it('re-prices a paid-up member from the next billing date, banking the past at the OLD price', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const startDate = new Date(Date.now() - 70 * DAY_MS)
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: startDate.toISOString() })
    // Three monthly periods have elapsed; paid in full.
    for (let i = 0; i < 3; i++) {
      await recordMembershipPayment(membership.id, { amountCents: 10_000, paidOn: new Date().toISOString() })
    }
    expect((await getMembershipForStudent(student.id))?.amountOwedCents).toBe(0)

    await updateMembershipPlan(plan.id, { priceCents: 12_000 })
    const { updated } = await applyPlanTermsToActiveMemberships(plan.id)
    expect(updated).toBe(1)

    const row = await mockPrisma.studentMembership.findUniqueOrThrow({ where: { id: membership.id } })
    // The three elapsed periods are each recorded at $100, NOT the new $120 —
    // the past is never rewritten, and each keeps its own row rather than
    // being flattened into a single banked total.
    const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
    expect(charges).toHaveLength(3)
    expect(charges.every((c) => c.priceCents === 10_000)).toBe(true)
    // Going forward the membership bills at the new price…
    expect(row.billedPriceCents).toBe(12_000)
    // …anchored to the current period's end, so the billing day doesn't shift.
    const { periodEnd } = currentPeriodBounds(startDate, 'monthly', new Date())
    expect(row.startDate.getTime()).toBe(periodEnd.getTime())

    // Still paid up right now: $300 banked, $300 paid, new price not yet due.
    const after = await getMembershipForStudent(student.id)
    expect(after?.amountOwedCents).toBe(0)
    expect(after?.effectivePriceCents).toBe(12_000)
  })

  it('leaves a behind member owing the same amount (current period keeps the old price)', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const membership = await assignMembership(student.id, {
      planId: plan.id,
      startDate: new Date(Date.now() - 70 * DAY_MS).toISOString(),
    })
    // 3 periods elapsed, only $250 paid — owes $50 at the old price.
    await recordMembershipPayment(membership.id, { amountCents: 25_000, paidOn: new Date().toISOString() })
    const owedBefore = (await getMembershipForStudent(student.id))!.amountOwedCents
    expect(owedBefore).toBe(5_000)

    await updateMembershipPlan(plan.id, { priceCents: 12_000 })
    await applyPlanTermsToActiveMemberships(plan.id)

    // The outstanding $50 is for a period that predates the rise, so it stays $50.
    expect((await getMembershipForStudent(student.id))?.amountOwedCents).toBe(5_000)
  })

  it('skips members with a custom price and does not count them', async () => {
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const standard = await makeStudent()
    const custom = await makeStudent()
    const startDate = new Date(Date.now() - 70 * DAY_MS).toISOString()
    await assignMembership(standard.id, { planId: plan.id, startDate })
    const customMembership = await assignMembership(custom.id, {
      planId: plan.id,
      priceOverrideCents: 7_000,
      startDate,
    })

    await updateMembershipPlan(plan.id, { priceCents: 12_000 })
    const { updated } = await applyPlanTermsToActiveMemberships(plan.id)

    // Only the standard-price member is touched.
    expect(updated).toBe(1)
    const customRow = await mockPrisma.studentMembership.findUniqueOrThrow({ where: { id: customMembership.id } })
    expect(customRow.priceOverrideCents).toBe(7_000)
    expect(customRow.billedPriceCents).toBe(10_000)
    // assignMembership's own read already materialized this membership's
    // charges at its custom price — applyPlanTermsToActiveMemberships filtered
    // it out of the query entirely, so none of them were re-priced to $120
    // (or, since it was never touched, even re-created at the plan's old $100).
    const customCharges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: customMembership.id } })
    expect(customCharges.length).toBeGreaterThan(0)
    expect(customCharges.every((c) => c.priceCents === 7_000)).toBe(true)
  })

  it('adopts the new terms without re-anchoring a not-yet-started membership', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const futureStart = new Date(Date.now() + 40 * DAY_MS)
    const membership = await assignMembership(student.id, {
      planId: plan.id,
      startDate: futureStart.toISOString(),
    })

    await updateMembershipPlan(plan.id, { priceCents: 12_000 })
    await applyPlanTermsToActiveMemberships(plan.id)

    const row = await mockPrisma.studentMembership.findUniqueOrThrow({ where: { id: membership.id } })
    // New price adopted, but the future start is left alone — banking/re-anchoring
    // here would swallow the member's first period.
    expect(row.billedPriceCents).toBe(12_000)
    expect(row.startDate.getTime()).toBe(futureStart.getTime())
    // Nothing has started yet, so nothing was materialized.
    const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
    expect(charges).toHaveLength(0)
  })
})

// The ledger itself: MembershipCharge is what amountOwedCents is now actually
// computed from (see ensureChargesMaterialized/computeOwedFromCharges), so
// these test the materialization mechanics directly rather than only through
// the balance they produce.
describe('membership charge ledger', () => {
  it('materializes one charge row per elapsed period, at the price in effect', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const startDate = new Date(Date.now() - 70 * DAY_MS) // 3 monthly periods elapsed
    const membership = await assignMembership(student.id, { planId: plan.id, startDate: startDate.toISOString() })

    await getMembershipForStudent(student.id)

    const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
    expect(charges).toHaveLength(3)
    expect(charges.every((c) => c.priceCents === 10_000)).toBe(true)
  })

  it('does not double-charge a period already materialized by an earlier read', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const membership = await assignMembership(student.id, {
      planId: plan.id,
      startDate: new Date(Date.now() - 70 * DAY_MS).toISOString(),
    })

    await getMembershipForStudent(student.id)
    await getMembershipForStudent(student.id)
    await getMembershipForStudent(student.id)

    const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
    expect(charges).toHaveLength(3) // still 3, not 9
  })

  it('seeds one opening-balance row from a pre-existing priorChargesCents value, exactly once', async () => {
    const student = await makeStudent()
    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    // Simulates a membership that already had a banked balance from before
    // this ledger existed — created directly rather than via assignMembership,
    // which always starts a fresh membership at priorChargesCents 0.
    const membership = await mockPrisma.studentMembership.create({
      data: {
        studentId: student.id,
        planId: plan.id,
        billedPriceCents: 10_000,
        billingFrequency: 'monthly',
        priorChargesCents: 45_000,
        startDate: new Date(),
      },
    })

    const first = await getMembershipForStudent(student.id)
    expect(first?.amountOwedCents).toBe(45_000 + 10_000) // legacy balance + the current period

    await getMembershipForStudent(student.id) // a second read must not re-seed it

    const charges = await mockPrisma.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
    const openingBalanceRows = charges.filter((c) => c.periodStart === null)
    expect(openingBalanceRows).toHaveLength(1)
    expect(openingBalanceRows[0].priceCents).toBe(45_000)
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
    expect(afterFirstHalf.status).toBe('due')

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
    expect(afterDelete.status).toBe('due')
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

describe('getPaymentHistoryForStudent', () => {
  it('spans a cancelled membership and its replacement, newest payment first', async () => {
    const student = await makeStudent()
    const oldPlan = await makePlan()
    const newPlan = await mockPrisma.membershipPlan.create({
      data: { title: 'Legacy Unlimited', priceCents: 7000, includedPrivateLessons: 0 },
    })

    const oldMembership = await assignMembership(student.id, { planId: oldPlan.id, startDate: new Date('2024-01-01').toISOString() })
    await recordMembershipPayment(oldMembership.id, { amountCents: 8000, paidOn: new Date('2024-01-01').toISOString() })
    await cancelMembership(oldMembership.id)

    const newMembership = await assignMembership(student.id, { planId: newPlan.id, startDate: new Date('2024-06-01').toISOString() })
    await recordMembershipPayment(newMembership.id, { amountCents: 7000, paidOn: new Date('2024-06-01').toISOString() })

    const history = await getPaymentHistoryForStudent(student.id)

    expect(history).toHaveLength(2)
    // Newest first, regardless of which membership row it belongs to.
    expect(history[0].amountCents).toBe(7000)
    expect(history[0].planTitle).toBe('Legacy Unlimited')
    expect(history[1].amountCents).toBe(8000)
    expect(history[1].planTitle).toBe('Unlimited Group')
  })

  it('returns an empty array for a student with no memberships at all', async () => {
    const student = await makeStudent()
    const history = await getPaymentHistoryForStudent(student.id)
    expect(history).toEqual([])
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
