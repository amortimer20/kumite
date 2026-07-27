// Spins up a real, throwaway SQLite database (migrated with the actual
// migration history) for integration tests — never the real dev.db. Tests
// that need this also `vi.mock('../db.ts', ...)` so the modules under test
// pick up this client instead of the real singleton.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../../generated/prisma/client.ts'
import { applyPendingMigrations } from '../migrate.ts'

export async function createTestDb() {
  const dbPath = path.join(os.tmpdir(), `kumite-test-${crypto.randomUUID()}.db`)
  applyPendingMigrations(dbPath)

  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
  const prisma = new PrismaClient({ adapter })

  async function cleanup() {
    await prisma.$disconnect()
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true })
    }
  }

  return { prisma, cleanup }
}
