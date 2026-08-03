import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { deleteStudent } = await import('./students.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

const DAY_MS = 86_400_000

async function makeStudent() {
  return mockPrisma.student.create({ data: { firstName: 'Maya', lastName: 'Chen' } })
}

async function makeInstructor() {
  return mockPrisma.instructor.create({ data: { firstName: 'Sam', lastName: 'Rivera' } })
}

async function makeLesson(studentId: string, instructorId: string) {
  return mockPrisma.lesson.create({
    data: {
      studentId,
      instructorId,
      startTime: new Date(Date.now() - 7 * DAY_MS),
      endTime: new Date(Date.now() - 7 * DAY_MS + 1_800_000),
      status: 'completed',
    },
  })
}

// Documents the database behaviour that deleteStudent's explicit history check
// exists to compensate for. If this ever starts failing — because the foreign
// key was changed back to RESTRICT, or Prisma's default for optional relations
// changed — then the explicit check is no longer load-bearing and this file's
// "archives a student who has lessons" test would pass for the wrong reason.
describe('Lesson.studentId foreign key', () => {
  it('is ON DELETE SET NULL, so deleting a student with lessons succeeds and orphans them', async () => {
    const student = await makeStudent()
    const instructor = await makeInstructor()
    const lesson = await makeLesson(student.id, instructor.id)

    await mockPrisma.student.delete({ where: { id: student.id } })

    const lessonRow = await mockPrisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })
    expect(lessonRow.studentId).toBeNull()
  })
})

describe('deleteStudent', () => {
  it('hard-deletes a student with no history at all', async () => {
    const student = await makeStudent()

    const result = await deleteStudent(student.id)

    expect(result.archived).toBe(false)
    expect(await mockPrisma.student.findUnique({ where: { id: student.id } })).toBeNull()
  })

  // Regression test for the bug this file was created for. Lesson.studentId is
  // `ON DELETE SET NULL`, so `student.delete()` on a student who has lessons
  // but no membership *succeeds* — the old code inferred "should archive" from
  // a foreign-key error that never fired, hard-deleted the student, and left
  // their lessons behind with a null studentId while telling the user the
  // student had been archived.
  it('archives a student who has lessons but no membership, keeping the lessons attributed', async () => {
    const student = await makeStudent()
    const instructor = await makeInstructor()
    const lesson = await makeLesson(student.id, instructor.id)

    expect(await mockPrisma.studentMembership.count({ where: { studentId: student.id } })).toBe(0)

    const result = await deleteStudent(student.id)

    expect(result.archived).toBe(true)
    const row = await mockPrisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(row.active).toBe(false)

    // The critical assertion: the lesson is still attached to a real student,
    // not orphaned with studentId === null.
    const lessonRow = await mockPrisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })
    expect(lessonRow.studentId).toBe(student.id)
  })

  it('archives a student whose only history is a recurring series, and deactivates it', async () => {
    const student = await makeStudent()
    const instructor = await makeInstructor()
    const series = await mockPrisma.recurringSeries.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        dayOfWeek: 1,
        startTime: '15:00',
        endTime: '15:30',
        generatedUntil: new Date(Date.now() + 30 * DAY_MS),
      },
    })

    const result = await deleteStudent(student.id)

    expect(result.archived).toBe(true)
    const seriesRow = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: series.id } })
    expect(seriesRow.studentId).toBe(student.id)
    expect(seriesRow.active).toBe(false)
  })

  it('force-deletes the student along with their lessons and billing history', async () => {
    const student = await makeStudent()
    const instructor = await makeInstructor()
    const lesson = await makeLesson(student.id, instructor.id)

    const plan = await mockPrisma.membershipPlan.create({
      data: { title: 'Monthly', billingFrequency: 'monthly', priceCents: 10_000 },
    })
    const membership = await mockPrisma.studentMembership.create({
      data: {
        studentId: student.id,
        planId: plan.id,
        billedPriceCents: 10_000,
        billingFrequency: 'monthly',
        startDate: new Date(Date.now() - 30 * DAY_MS),
      },
    })
    const payment = await mockPrisma.membershipPayment.create({
      data: { studentMembershipId: membership.id, amountCents: 10_000, paidOn: new Date() },
    })

    const result = await deleteStudent(student.id, { force: true })

    expect(result.archived).toBe(false)
    expect(await mockPrisma.student.findUnique({ where: { id: student.id } })).toBeNull()
    expect(await mockPrisma.lesson.findUnique({ where: { id: lesson.id } })).toBeNull()
    expect(await mockPrisma.studentMembership.findUnique({ where: { id: membership.id } })).toBeNull()
    expect(await mockPrisma.membershipPayment.findUnique({ where: { id: payment.id } })).toBeNull()
    // The plan itself is shared, so it must survive.
    expect(await mockPrisma.membershipPlan.findUnique({ where: { id: plan.id } })).not.toBeNull()
  })
})
