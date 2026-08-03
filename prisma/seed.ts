// Dev-only sample data generator. Run via `npm run db:seed` — never shipped in
// the packaged app, since it's a plain CLI script, not wired into any IPC handler.
//
// Deliberately covers every corner of the app so a fresh dev.db can be
// browsed to see all the states the UI supports, not just a "happy path":
// membership status ok/due_soon/overdue (including a split/partial payment
// and a zero-payment case), all three billing frequencies, a plan archived
// out from under a still-enrolled student, a price override, a usage
// adjustment, private + group lessons in every status, a recurring private
// series, a recurring group class, and an archived student/instructor.
//
// Membership due dates are computed live from real elapsed time, so the
// "due_soon"/"overdue" cases here are relative to *today* — they'll still
// read correctly days or weeks after seeding (the math doesn't drift), but
// the specific "2 days until due" framing in these comments assumes you're
// looking at this shortly after running it.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.ts'
import { addDaysIso, combineDateAndTime, computeOccurrenceDates, isoDateOf } from '../electron/recurringSeriesLogic.ts'

const adapter = new PrismaBetterSqlite3({ url: 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

function todayAt(hour: number, minute = 0) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

function daysFromNowAt(days: number, hour: number, minute = 0) {
  const d = todayAt(hour, minute)
  d.setDate(d.getDate() + days)
  return d
}

// Weekly occurrences, `count` of them starting at `startDateIso`/`startTime`.
async function createRecurringSeries({
  studentId,
  instructorId,
  type,
  title,
  startDateIso,
  startTime,
  endTime,
  notes,
  count,
}: {
  studentId?: string
  instructorId: string
  type: 'private' | 'group'
  title?: string
  startDateIso: string
  startTime: string
  endTime: string
  notes?: string
  count: number
}) {
  const horizon = combineDateAndTime(addDaysIso(startDateIso, (count - 1) * 7), startTime)
  const occurrenceDates = computeOccurrenceDates(startDateIso, startTime, horizon)
  const dayOfWeek = new Date(`${startDateIso}T00:00:00`).getDay()

  const series = await prisma.recurringSeries.create({
    data: {
      studentId: type === 'private' ? studentId : null,
      instructorId,
      type,
      title: type === 'group' ? title : null,
      dayOfWeek,
      startTime,
      endTime,
      generatedUntil: horizon,
    },
  })
  for (const [index, iso] of occurrenceDates.entries()) {
    await prisma.lesson.create({
      data: {
        studentId: type === 'private' ? studentId : null,
        instructorId,
        type,
        title: type === 'group' ? title : null,
        startTime: combineDateAndTime(iso, startTime),
        endTime: combineDateAndTime(iso, endTime),
        notes: index === 0 ? notes ?? null : null,
        recurringSeriesId: series.id,
      },
    })
  }
  return series
}

async function createMembership({
  studentId,
  planId,
  startDate,
  priceOverrideCents,
  payments,
}: {
  studentId: string
  planId: string
  startDate: Date
  priceOverrideCents?: number
  payments: { amountCents: number; paidOn: Date; method?: string; notes?: string }[]
}) {
  // billedPriceCents/billingFrequency are snapshotted onto the membership, so
  // seed them from the plan the same way assignMembership does.
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } })
  const membership = await prisma.studentMembership.create({
    data: {
      studentId,
      planId,
      startDate,
      priceOverrideCents: priceOverrideCents ?? null,
      billedPriceCents: plan.priceCents,
      billingFrequency: plan.billingFrequency,
    },
  })
  for (const payment of payments) {
    await prisma.membershipPayment.create({
      data: {
        studentMembershipId: membership.id,
        amountCents: payment.amountCents,
        paidOn: payment.paidOn,
        method: payment.method ?? null,
        notes: payment.notes ?? null,
      },
    })
  }
  return membership
}

async function main() {
  // --- Instructors ---
  const [riley, jordan, casey] = await Promise.all([
    prisma.instructor.create({ data: { firstName: 'Riley', lastName: 'Nakamura', email: 'riley@example.com' } }),
    prisma.instructor.create({ data: { firstName: 'Jordan', lastName: 'Ellis', email: 'jordan@example.com' } }),
    prisma.instructor.create({ data: { firstName: 'Casey', lastName: 'Morgan', email: 'casey@example.com' } }),
  ])
  await prisma.instructor.create({
    data: { firstName: 'Former', lastName: 'Instructor', active: false },
  })

  // --- Students ---
  // memberSince roughly tracks rank (higher rank, longer tenure) so the
  // Details view shows a believable spread rather than every student
  // reading as brand new.
  const students = await Promise.all([
    prisma.student.create({ data: { firstName: 'Maya', lastName: 'Chen', rank: 'White', memberSince: daysFromNowAt(-45, 0) } }),
    prisma.student.create({ data: { firstName: 'Ethan', lastName: 'Brooks', rank: 'Yellow', memberSince: daysFromNowAt(-140, 0) } }),
    prisma.student.create({
      data: {
        firstName: 'Sofia',
        lastName: 'Ramirez',
        rank: 'Orange',
        memberSince: daysFromNowAt(-280, 0),
        street: '482 Birchwood Ln',
        city: 'Springfield',
        state: 'OH',
        zip: '45501',
        notes: 'Sibling of Diego Ramirez, same pickup time.',
      },
    }),
    prisma.student.create({ data: { firstName: 'Diego', lastName: 'Ramirez', rank: 'Green', memberSince: daysFromNowAt(-800, 0) } }),
    prisma.student.create({ data: { firstName: 'Liam', lastName: 'Patel', rank: 'Blue', memberSince: daysFromNowAt(-600, 0) } }),
    prisma.student.create({ data: { firstName: 'Ava', lastName: 'Thompson', rank: 'Brown 2nd', memberSince: daysFromNowAt(-1300, 0) } }),
    prisma.student.create({ data: { firstName: 'Noah', lastName: 'Kim', rank: 'Black 1st', memberSince: daysFromNowAt(-2200, 0) } }),
    prisma.student.create({ data: { firstName: 'Priya', lastName: 'Singh', rank: 'Purple', memberSince: daysFromNowAt(-420, 0) } }),
    // Archived, to exercise the "Show archived" / reactivate path.
    prisma.student.create({ data: { firstName: 'Former', lastName: 'Student', rank: 'White', active: false, memberSince: daysFromNowAt(-700, 0) } }),
  ])
  const [maya, ethan, sofia, diego, liam, ava, noah, priya] = students

  // --- Family members ---
  const familyMembers = await Promise.all([
    prisma.familyMember.create({ data: { studentId: maya.id, firstName: 'Jake', lastName: 'Chen', rank: 'Yellow' } }),
    prisma.familyMember.create({ data: { studentId: liam.id, firstName: 'Priya', lastName: 'Patel', rank: 'White' } }),
    prisma.familyMember.create({ data: { studentId: noah.id, firstName: 'Ella', lastName: 'Kim', rank: 'Orange' } }),
    prisma.familyMember.create({ data: { studentId: noah.id, firstName: 'Mia', lastName: 'Kim', rank: 'White' } }),
  ])

  // --- Membership plans (all 3 billing frequencies represented) ---
  const [twoPrivate, fourPrivate, , weeklyDropIn, , legacyUnlimited] = await Promise.all([
    prisma.membershipPlan.create({
      data: { title: '2 Private, Unlimited Group', billingFrequency: 'monthly', priceCents: 12000, includedPrivateLessons: 2 },
    }),
    prisma.membershipPlan.create({
      data: { title: '4 Private, Unlimited Group', billingFrequency: 'monthly', priceCents: 16000, includedPrivateLessons: 4 },
    }),
    // Offered but nobody's on it yet — a real plan can just sit unused.
    prisma.membershipPlan.create({
      data: { title: 'Unlimited Group', billingFrequency: 'monthly', priceCents: 8000, includedPrivateLessons: 0 },
    }),
    prisma.membershipPlan.create({
      data: { title: 'Weekly Drop-In', billingFrequency: 'weekly', priceCents: 2500, includedPrivateLessons: 0 },
    }),
    prisma.membershipPlan.create({
      data: { title: 'Biweekly Bootcamp', billingFrequency: 'biweekly', priceCents: 5000, includedPrivateLessons: 0 },
    }),
    // Discontinued, but Noah is still on it from before — exercises the
    // "student's own plan shows in Change Plan even though it's archived"
    // fallback, and the plan-delete archive-on-FK-violation path.
    prisma.membershipPlan.create({
      data: { title: 'Legacy Unlimited', billingFrequency: 'monthly', priceCents: 7000, includedPrivateLessons: 0, active: false },
    }),
  ])

  // --- Memberships ---
  // Ethan: paid in full, comfortably ahead of due — ok.
  await createMembership({
    studentId: ethan.id,
    planId: twoPrivate.id,
    startDate: daysFromNowAt(-20, 9),
    payments: [{ amountCents: 12000, paidOn: daysFromNowAt(-20, 9), method: 'Card' }],
  })

  // Sofia: weekly plan, one payment in, due again in ~2 days — due_soon.
  await createMembership({
    studentId: sofia.id,
    planId: weeklyDropIn.id,
    startDate: daysFromNowAt(-5, 9),
    payments: [{ amountCents: 2500, paidOn: daysFromNowAt(-5, 9), method: 'Cash' }],
  })

  // Diego: paid half of this period's price — overdue, $60 owed, demonstrating
  // that a split payment leaves the remainder owed instead of reading as paid.
  await createMembership({
    studentId: diego.id,
    planId: twoPrivate.id,
    startDate: daysFromNowAt(-10, 9),
    payments: [{ amountCents: 6000, paidOn: daysFromNowAt(-10, 9), method: 'Cash', notes: 'Paid half, rest next week' }],
  })

  // Priya: weekly plan, never paid — overdue from day one.
  await createMembership({
    studentId: priya.id,
    planId: weeklyDropIn.id,
    startDate: daysFromNowAt(-3, 9),
    payments: [],
  })

  // Liam: discounted custom rate ($140 instead of the plan's $160) — ok,
  // demonstrates priceOverrideCents and the "(custom price)" label.
  await createMembership({
    studentId: liam.id,
    planId: fourPrivate.id,
    startDate: daysFromNowAt(-15, 9),
    priceOverrideCents: 14000,
    payments: [{ amountCents: 14000, paidOn: daysFromNowAt(-15, 9), method: 'Card' }],
  })

  // Ava: paid in full — ok. Gets a usage adjustment below once her lesson is scheduled.
  const avaMembership = await createMembership({
    studentId: ava.id,
    planId: twoPrivate.id,
    startDate: daysFromNowAt(-5, 9),
    payments: [{ amountCents: 12000, paidOn: daysFromNowAt(-5, 9), method: 'Card' }],
  })

  // Noah: two payments against the now-discontinued Legacy Unlimited plan —
  // ok, and still shows his real plan even though it's archived.
  await createMembership({
    studentId: noah.id,
    planId: legacyUnlimited.id,
    startDate: daysFromNowAt(-40, 9),
    payments: [
      { amountCents: 7000, paidOn: daysFromNowAt(-40, 9), method: 'Card' },
      { amountCents: 7000, paidOn: daysFromNowAt(-10, 9), method: 'Card' },
    ],
  })

  // A +1 bonus lesson credit — nets out the private lesson she's scheduled
  // for today, so "used" reads as 0 instead of 1 despite the lesson existing.
  await prisma.membershipUsageAdjustment.create({
    data: { studentMembershipId: avaMembership.id, delta: 1, reason: 'Bonus lesson for referring a friend' },
  })

  // --- One-off private lessons ---
  await Promise.all([
    prisma.lesson.create({ data: { studentId: ethan.id, instructorId: riley.id, startTime: todayAt(15), endTime: todayAt(15, 30) } }),
    prisma.lesson.create({ data: { studentId: ava.id, instructorId: riley.id, startTime: todayAt(15, 30), endTime: todayAt(16) } }),
    prisma.lesson.create({ data: { studentId: sofia.id, instructorId: jordan.id, startTime: todayAt(16), endTime: todayAt(16, 45), notes: 'Working on kata for belt test.' } }),
    prisma.lesson.create({ data: { studentId: diego.id, instructorId: jordan.id, startTime: daysFromNowAt(1, 17), endTime: daysFromNowAt(1, 17, 30) } }),
    prisma.lesson.create({ data: { studentId: liam.id, instructorId: riley.id, startTime: daysFromNowAt(2, 15), endTime: daysFromNowAt(2, 15, 30) } }),
    prisma.lesson.create({ data: { studentId: noah.id, instructorId: riley.id, startTime: daysFromNowAt(-2, 15), endTime: daysFromNowAt(-2, 15, 30), status: 'completed' } }),
    prisma.lesson.create({ data: { studentId: maya.id, instructorId: casey.id, startTime: daysFromNowAt(-1, 15), endTime: daysFromNowAt(-1, 15, 30), status: 'no_show' } }),
    prisma.lesson.create({ data: { studentId: liam.id, instructorId: jordan.id, startTime: daysFromNowAt(-3, 15), endTime: daysFromNowAt(-3, 15, 30), status: 'cancelled' } }),
  ])

  // --- Recurring private series: Maya's standing weekly lesson ---
  await createRecurringSeries({
    studentId: maya.id,
    instructorId: jordan.id,
    type: 'private',
    startDateIso: isoDateOf(daysFromNowAt(2, 0)),
    startTime: '16:00',
    endTime: '16:30',
    count: 4,
  })

  // --- Group lessons: no per-student roster, just a block on the schedule ---
  await createRecurringSeries({
    instructorId: casey.id,
    type: 'group',
    title: 'Cardio',
    startDateIso: isoDateOf(todayAt(0)),
    startTime: '17:00',
    endTime: '18:00',
    count: 4,
  })
  await prisma.lesson.create({
    data: {
      instructorId: riley.id,
      type: 'group',
      title: 'Self Defense Workshop',
      startTime: daysFromNowAt(3, 18),
      endTime: daysFromNowAt(3, 19),
    },
  })

  // --- Intro lesson: a free trial for a prospect, no Student record ---
  await prisma.lesson.create({
    data: {
      instructorId: casey.id,
      type: 'intro',
      prospectName: 'Priya Kapoor',
      prospectPhone: '555-0142',
      startTime: daysFromNowAt(1, 15, 30),
      endTime: daysFromNowAt(1, 16),
    },
  })

  // --- POS catalog (front-desk merchandise) ---
  const posItems = await Promise.all([
    prisma.posItem.create({ data: { name: 'Gloves', priceCents: 2500 } }),
    prisma.posItem.create({ data: { name: 'Hand wraps', priceCents: 1000 } }),
    prisma.posItem.create({ data: { name: 'Kumite gear', priceCents: 6000 } }),
    prisma.posItem.create({ data: { name: 'Picture manual', priceCents: 1500 } }),
    prisma.posItem.create({ data: { name: 'T-Shirt', priceCents: 2000 } }),
    prisma.posItem.create({ data: { name: 'Uniform', priceCents: 5500 } }),
    prisma.posItem.create({ data: { name: 'Belt', priceCents: 1200 } }),
  ])

  console.log(
    `Seeded ${students.length} students (1 archived), 4 instructors (1 archived), ${familyMembers.length} family members, ` +
      `6 membership plans (1 archived), 7 memberships spanning ok/due_soon/overdue, a mix of private/group/recurring lessons, ` +
      `and ${posItems.length} POS catalog items.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
