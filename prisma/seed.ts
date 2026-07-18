// Dev-only sample data generator. Run via `npm run db:seed` — never shipped in
// the packaged app, since it's a plain CLI script, not wired into any IPC handler.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.ts'

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

async function main() {
  const [riley, jordan] = await Promise.all([
    prisma.instructor.create({ data: { firstName: 'Riley', lastName: 'Nakamura', email: 'riley@example.com' } }),
    prisma.instructor.create({ data: { firstName: 'Jordan', lastName: 'Ellis', email: 'jordan@example.com' } }),
  ])

  const students = await Promise.all([
    prisma.student.create({ data: { firstName: 'Maya', lastName: 'Chen', rank: 'White' } }),
    prisma.student.create({ data: { firstName: 'Ethan', lastName: 'Brooks', rank: 'Yellow' } }),
    prisma.student.create({
      data: {
        firstName: 'Sofia',
        lastName: 'Ramirez',
        rank: 'Orange',
        street: '482 Birchwood Ln',
        city: 'Springfield',
        state: 'OH',
        zip: '45501',
        notes: 'Sibling of Diego Ramirez, same pickup time.',
      },
    }),
    prisma.student.create({ data: { firstName: 'Diego', lastName: 'Ramirez', rank: 'Green' } }),
    prisma.student.create({ data: { firstName: 'Liam', lastName: 'Patel', rank: 'Blue' } }),
    prisma.student.create({ data: { firstName: 'Ava', lastName: 'Thompson', rank: 'Brown 2nd' } }),
    prisma.student.create({ data: { firstName: 'Noah', lastName: 'Kim', rank: 'Black' } }),
    // One archived student, to exercise the "Show archived" / reactivate path.
    prisma.student.create({ data: { firstName: 'Former', lastName: 'Student', rank: 'White', active: false } }),
  ])
  const [maya, ethan, sofia, diego, liam, ava, noah] = students

  // A handful of one-off lessons this week, kept non-overlapping per instructor.
  await Promise.all([
    prisma.lesson.create({ data: { studentId: maya.id, instructorId: riley.id, startTime: todayAt(15), endTime: todayAt(15, 30) } }),
    prisma.lesson.create({ data: { studentId: ethan.id, instructorId: riley.id, startTime: todayAt(15, 30), endTime: todayAt(16) } }),
    prisma.lesson.create({ data: { studentId: sofia.id, instructorId: jordan.id, startTime: todayAt(16), endTime: todayAt(16, 45), notes: 'Working on kata for belt test.' } }),
    prisma.lesson.create({ data: { studentId: diego.id, instructorId: jordan.id, startTime: daysFromNowAt(1, 17), endTime: daysFromNowAt(1, 17, 30) } }),
    prisma.lesson.create({ data: { studentId: liam.id, instructorId: riley.id, startTime: daysFromNowAt(2, 15), endTime: daysFromNowAt(2, 15, 30) } }),
    prisma.lesson.create({ data: { studentId: ava.id, instructorId: riley.id, startTime: daysFromNowAt(-2, 15), endTime: daysFromNowAt(-2, 15, 30), status: 'completed' } }),
    prisma.lesson.create({ data: { studentId: noah.id, instructorId: jordan.id, startTime: daysFromNowAt(-1, 16), endTime: daysFromNowAt(-1, 16, 30), status: 'no_show' } }),
  ])

  // A few family members — trained-but-not-independently-schedulable household
  // members tracked under a primary student's contact record.
  const familyMembers = await Promise.all([
    prisma.familyMember.create({ data: { studentId: maya.id, firstName: 'Jake', lastName: 'Chen', rank: 'Yellow' } }),
    prisma.familyMember.create({ data: { studentId: liam.id, firstName: 'Priya', lastName: 'Patel', rank: 'White' } }),
    prisma.familyMember.create({ data: { studentId: noah.id, firstName: 'Ella', lastName: 'Kim', rank: 'Orange' } }),
    prisma.familyMember.create({ data: { studentId: noah.id, firstName: 'Mia', lastName: 'Kim', rank: 'White' } }),
  ])

  console.log(`Seeded ${students.length} students (1 archived) and 2 instructors, with 7 sample lessons and ${familyMembers.length} family members.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
