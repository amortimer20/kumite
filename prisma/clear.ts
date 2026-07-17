// Dev-only full database wipe. Run via `npm run db:clear` — never shipped in
// the packaged app, since it's a plain CLI script, not wired into any IPC handler.
import { createInterface } from 'node:readline/promises'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.ts'

const adapter = new PrismaBetterSqlite3({ url: 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

async function confirm() {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('This will permanently delete ALL data in prisma/dev.db. Continue? (y/N) ')
  rl.close()
  return answer.trim().toLowerCase() === 'y'
}

async function main() {
  if (!(await confirm())) {
    console.log('Cancelled — nothing was deleted.')
    return
  }

  // Children before parents, to respect foreign keys.
  await prisma.lesson.deleteMany()
  await prisma.recurringSeries.deleteMany()
  await prisma.student.deleteMany()
  await prisma.instructor.deleteMany()
  await prisma.businessHours.deleteMany()

  console.log('Database cleared.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
