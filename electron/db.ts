import { app } from 'electron'
import path from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.ts'

const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'karate-app.db')
  : path.join(app.getAppPath(), 'prisma', 'dev.db')

const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })

export const prisma = new PrismaClient({ adapter })
