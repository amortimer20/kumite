import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import { prisma } from '../db.ts'
import { REPORT_PAYMENT_METHODS } from '../../shared/types.ts'
import type {
  Report,
  ReportDateRangeInput,
  ReportExportInput,
  ReportMethodBreakdown,
  ReportPaymentMethod,
  ReportSourceBreakdown,
} from '../../shared/types.ts'

// MembershipPayment.method is freeform text (no enum, unlike
// PosSale.paymentMethod which is already constrained to
// REPORT_PAYMENT_METHODS) — normalize case-insensitively; anything
// unrecognized (including null/empty) buckets into "other".
function normalizeMethod(method: string | null): ReportPaymentMethod {
  const m = method?.trim().toLowerCase()
  if (m === 'cash' || m === 'card' || m === 'check') return m
  return 'other'
}

function emptyByMethod(): ReportMethodBreakdown[] {
  return REPORT_PAYMENT_METHODS.map((method) => ({ method, totalCents: 0 }))
}

function addToBucket(byMethod: ReportMethodBreakdown[], method: ReportPaymentMethod, cents: number) {
  byMethod.find((b) => b.method === method)!.totalCents += cents
}

// Inclusive of the whole end-date calendar day — `lt` the start of the
// *next* day, not endDate's own midnight instant, so same-day transactions
// on the end date aren't excluded. Deliberately self-contained rather than
// importing src/lib/isoDate.ts — no existing electron/ file reaches into src/.
function rangeToInstants(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const endExclusive = new Date(`${endDate}T00:00:00`)
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { start, endExclusive }
}

export async function computeReport(input: ReportDateRangeInput): Promise<Report> {
  const { start, endExclusive } = rangeToInstants(input.startDate, input.endDate)

  const [payments, sales] = await Promise.all([
    prisma.membershipPayment.findMany({ where: { paidOn: { gte: start, lt: endExclusive } } }),
    prisma.posSale.findMany({ where: { createdAt: { gte: start, lt: endExclusive } } }),
  ])

  const membership: ReportSourceBreakdown = { totalCents: 0, count: payments.length, byMethod: emptyByMethod() }
  for (const p of payments) {
    membership.totalCents += p.amountCents
    addToBucket(membership.byMethod, normalizeMethod(p.method), p.amountCents)
  }

  const pos: ReportSourceBreakdown = { totalCents: 0, count: sales.length, byMethod: emptyByMethod() }
  for (const s of sales) {
    pos.totalCents += s.totalCents
    addToBucket(pos.byMethod, normalizeMethod(s.paymentMethod), s.totalCents)
  }

  return { startDate: input.startDate, endDate: input.endDate, membership, pos }
}

function defaultReportCsvName(startDate: string, endDate: string) {
  return `kumite-revenue-report-${startDate}-to-${endDate}.csv`
}

function formatDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

// No value here ever needs quote-escaping — every cell is a number or an
// app-generated label, never arbitrary user text.
function buildCsv(report: Report, includeMembership: boolean, includePos: boolean): string {
  const rows: (string | number)[][] = []
  rows.push(['Kumite Revenue Report'])
  rows.push(['Start Date', report.startDate])
  rows.push(['End Date', report.endDate])
  rows.push([])
  rows.push(['Summary'])
  rows.push(['Source', 'Count', 'Total'])

  let combinedCents = 0
  if (includeMembership) {
    rows.push(['Membership Dues', report.membership.count, formatDollars(report.membership.totalCents)])
    combinedCents += report.membership.totalCents
  }
  if (includePos) {
    rows.push(['POS Sales', report.pos.count, formatDollars(report.pos.totalCents)])
    combinedCents += report.pos.totalCents
  }
  rows.push(['Combined Total', '', formatDollars(combinedCents)])
  rows.push([])

  rows.push(['By Payment Method'])
  rows.push(['Method', 'Total'])
  for (const method of REPORT_PAYMENT_METHODS) {
    let cents = 0
    if (includeMembership) cents += report.membership.byMethod.find((b) => b.method === method)!.totalCents
    if (includePos) cents += report.pos.byMethod.find((b) => b.method === method)!.totalCents
    rows.push([method, formatDollars(cents)])
  }

  return rows.map((row) => row.join(',')).join('\n')
}

export function registerReportsHandlers() {
  ipcMain.handle('reports:generate', (_event, input: ReportDateRangeInput) => computeReport(input))

  ipcMain.handle('reports:exportCsv', async (_event, input: ReportExportInput) => {
    const report = await computeReport(input)
    const csv = buildCsv(report, input.includeMembership, input.includePos)

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Revenue Report',
      defaultPath: defaultReportCsvName(input.startDate, input.endDate),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return { canceled: true }

    fs.writeFileSync(filePath, csv, 'utf-8')
    return { canceled: false, path: filePath }
  })
}
