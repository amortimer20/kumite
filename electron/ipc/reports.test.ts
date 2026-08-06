import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'
import type { Report } from '../../shared/types.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { computeReport, buildCsv } = await import('./reports.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

// A membership needs a student + a plan behind it. Every test uses its own
// year so rows from one test can't fall inside another's date range (the
// throwaway DB is shared across the whole file).
async function makeMembership() {
  const student = await mockPrisma.student.create({ data: { firstName: 'Test', lastName: 'Student' } })
  const plan = await mockPrisma.membershipPlan.create({
    data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10000 },
  })
  const membership = await mockPrisma.studentMembership.create({
    data: {
      studentId: student.id,
      planId: plan.id,
      billedPriceCents: 10000,
      billingFrequency: 'monthly',
      startDate: new Date('2020-01-01T00:00:00'),
    },
  })
  return membership.id
}

describe('computeReport date boundaries', () => {
  // The end date is inclusive of its whole calendar day: a payment at 23:59
  // on endDate counts, one the next midnight doesn't. This is the entire
  // reason rangeToInstants uses `lt` the next day rather than endDate's own
  // midnight — get it wrong and every report silently drops its last day.
  it('includes a membership payment at 23:59 on the end date but not the next day', async () => {
    const membershipId = await makeMembership()
    await mockPrisma.membershipPayment.createMany({
      data: [
        { studentMembershipId: membershipId, amountCents: 5000, paidOn: new Date('2025-03-31T23:59:00') },
        { studentMembershipId: membershipId, amountCents: 9999, paidOn: new Date('2025-04-01T00:00:00') },
      ],
    })

    const report = await computeReport({ startDate: '2025-03-01', endDate: '2025-03-31' })
    expect(report.membership.count).toBe(1)
    expect(report.membership.totalCents).toBe(5000)
  })

  // Same boundary rule, POS side (queried on createdAt, a different column).
  it('includes a POS sale at 23:59 on the end date but not the next day', async () => {
    await mockPrisma.posSale.createMany({
      data: [
        { totalCents: 2500, paymentMethod: 'cash', createdAt: new Date('2023-06-30T23:59:59') },
        { totalCents: 7777, paymentMethod: 'cash', createdAt: new Date('2023-07-01T00:00:00') },
      ],
    })

    const report = await computeReport({ startDate: '2023-06-01', endDate: '2023-06-30' })
    expect(report.pos.count).toBe(1)
    expect(report.pos.totalCents).toBe(2500)
  })

  // A payment before the start of the range is excluded from the low end too.
  it('excludes a payment the day before the start date', async () => {
    const membershipId = await makeMembership()
    await mockPrisma.membershipPayment.createMany({
      data: [
        { studentMembershipId: membershipId, amountCents: 4000, paidOn: new Date('2022-01-31T23:59:00') },
        { studentMembershipId: membershipId, amountCents: 6000, paidOn: new Date('2022-02-01T00:00:00') },
      ],
    })

    const report = await computeReport({ startDate: '2022-02-01', endDate: '2022-02-28' })
    expect(report.membership.count).toBe(1)
    expect(report.membership.totalCents).toBe(6000)
  })
})

describe('computeReport payment-method breakdown', () => {
  // MembershipPayment.method is freeform text: casing is normalized and any
  // unrecognized value (including null) buckets into "other". Every report
  // always carries all four methods, zero-filled.
  it('normalizes casing and buckets unknown/null methods into other', async () => {
    const membershipId = await makeMembership()
    await mockPrisma.membershipPayment.createMany({
      data: [
        { studentMembershipId: membershipId, amountCents: 1000, method: 'cash', paidOn: new Date('2021-05-10T12:00:00') },
        { studentMembershipId: membershipId, amountCents: 2000, method: 'CARD', paidOn: new Date('2021-05-11T12:00:00') },
        { studentMembershipId: membershipId, amountCents: 3000, method: 'venmo', paidOn: new Date('2021-05-12T12:00:00') },
        { studentMembershipId: membershipId, amountCents: 500, method: null, paidOn: new Date('2021-05-13T12:00:00') },
      ],
    })

    const report = await computeReport({ startDate: '2021-05-01', endDate: '2021-05-31' })
    const byMethod = Object.fromEntries(report.membership.byMethod.map((b) => [b.method, b.totalCents]))
    expect(byMethod).toEqual({ cash: 1000, card: 2000, check: 0, other: 3500 })
    expect(report.membership.totalCents).toBe(6500)
  })
})

// buildCsv is a pure function, so it's tested directly on a hand-built Report
// rather than through the file-writing IPC handler — the flag logic is the
// one place CSV output can silently disagree with what's on screen.
describe('buildCsv include flags', () => {
  const report: Report = {
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    membership: {
      totalCents: 10000,
      count: 2,
      byMethod: [
        { method: 'cash', totalCents: 6000 },
        { method: 'card', totalCents: 4000 },
        { method: 'check', totalCents: 0 },
        { method: 'other', totalCents: 0 },
      ],
    },
    pos: {
      totalCents: 2500,
      count: 1,
      byMethod: [
        { method: 'cash', totalCents: 0 },
        { method: 'card', totalCents: 2500 },
        { method: 'check', totalCents: 0 },
        { method: 'other', totalCents: 0 },
      ],
    },
  }

  function combinedTotal(csv: string): string {
    const row = csv.split('\n').find((line) => line.startsWith('Combined Total,'))
    return row!.split(',').at(-1)!
  }

  function cashTotal(csv: string): string {
    const lines = csv.split('\n')
    const methodHeader = lines.indexOf('Method,Total')
    return lines[methodHeader + 1].split(',')[1]
  }

  it('sums both sources when both are included', () => {
    const csv = buildCsv(report, true, true)
    expect(combinedTotal(csv)).toBe('125.00')
    // cash = 6000 (membership) + 0 (pos)
    expect(cashTotal(csv)).toBe('60.00')
  })

  it('counts only membership when POS is excluded', () => {
    const csv = buildCsv(report, true, false)
    expect(combinedTotal(csv)).toBe('100.00')
    expect(cashTotal(csv)).toBe('60.00')
    // POS Sales row must be absent
    expect(csv).not.toContain('POS Sales')
  })

  it('counts only POS when membership is excluded', () => {
    const csv = buildCsv(report, false, true)
    expect(combinedTotal(csv)).toBe('25.00')
    // cash now only reflects POS, which had none
    expect(cashTotal(csv)).toBe('0.00')
    expect(csv).not.toContain('Membership Dues')
  })

  it('zeroes the combined total when neither source is included', () => {
    const csv = buildCsv(report, false, false)
    expect(combinedTotal(csv)).toBe('0.00')
  })
})
