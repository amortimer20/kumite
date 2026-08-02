import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import type { Report, ReportPaymentMethod, ReportSourceBreakdown } from '../../shared/types'
import { REPORT_PAYMENT_METHODS } from '../../shared/types'
import {
  endOfLastMonthIso,
  endOfMonthIso,
  endOfYearIso,
  startOfLastMonthIso,
  startOfMonthIso,
  startOfYearIso,
} from '@/lib/isoDate'
import { formatCents } from '@/lib/membershipFormat'
import { getErrorMessage } from '@/lib/errors'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAYMENT_METHOD_LABEL: Record<ReportPaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  check: 'Check',
  other: 'Other',
}

function sumBreakdowns(sources: ReportSourceBreakdown[]) {
  const combinedCents = sources.reduce((sum, s) => sum + s.totalCents, 0)
  const byMethod = REPORT_PAYMENT_METHODS.map((method) => ({
    method,
    totalCents: sources.reduce((sum, s) => sum + s.byMethod.find((b) => b.method === method)!.totalCents, 0),
  }))
  return { combinedCents, byMethod }
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-40 flex-1 items-center gap-3 rounded-lg border border-border bg-card p-3">
      <BarChart3 className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export function ReportsPanel() {
  const [startDate, setStartDate] = useState(startOfMonthIso())
  const [endDate, setEndDate] = useState(endOfMonthIso())
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const showLoading = useDelayedFlag(loading)
  const [exporting, setExporting] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const [includeMembership, setIncludeMembership] = useState(true)
  const [includePos, setIncludePos] = useState(true)

  async function handleGenerate(rangeStart = startDate, rangeEnd = endDate) {
    if (rangeEnd < rangeStart) {
      setRangeError('End date must be on or after the start date.')
      return
    }
    setRangeError(null)
    setLoading(true)
    try {
      const result = await api.reports.generate({ startDate: rangeStart, endDate: rangeEnd })
      setReport(result)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function applyPreset(rangeStart: string, rangeEnd: string) {
    setStartDate(rangeStart)
    setEndDate(rangeEnd)
    handleGenerate(rangeStart, rangeEnd)
  }

  async function handleExportCsv() {
    if (!report) return
    setExporting(true)
    try {
      const result = await api.reports.exportCsv({ startDate, endDate, includeMembership, includePos })
      if (!result.canceled) {
        toast.success(`Report saved to ${result.path}`)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const sources = report
    ? [includeMembership ? report.membership : null, includePos ? report.pos : null].filter(
        (s): s is ReportSourceBreakdown => s !== null,
      )
    : []
  const { combinedCents, byMethod } = sumBreakdowns(sources)

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Reports</h2>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => applyPreset(startOfMonthIso(), endOfMonthIso())}>This Month</Button>
        <Button variant="outline" onClick={() => applyPreset(startOfLastMonthIso(), endOfLastMonthIso())}>Last Month</Button>
        <Button variant="outline" onClick={() => applyPreset(startOfYearIso(), endOfYearIso())}>This Year</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <Label className="mb-1">Start date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1">End date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button onClick={() => handleGenerate()}>Generate Report</Button>
      </div>
      {rangeError && <p className="mb-4 text-sm text-destructive">{rangeError}</p>}

      {loading ? (
        showLoading ? <p className="text-sm italic text-muted-foreground">Generating report…</p> : null
      ) : !report ? (
        <p className="text-sm italic text-muted-foreground">
          Select a date range and generate a report to see revenue totals.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={includeMembership} onCheckedChange={(checked) => setIncludeMembership(checked === true)} />
              Include Membership Dues
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={includePos} onCheckedChange={(checked) => setIncludePos(checked === true)} />
              Include POS Sales
            </label>
          </div>

          <StatTile label={`Combined revenue, ${report.startDate} to ${report.endDate}`} value={formatCents(combinedCents)} />

          <div className="flex flex-wrap gap-4">
            <div className={`flex min-w-48 flex-1 flex-col gap-1 rounded-lg border border-border bg-card p-3 ${includeMembership ? '' : 'opacity-50'}`}>
              <p className="font-medium">Membership Dues</p>
              <p className="text-sm text-muted-foreground">
                {report.membership.count} payment{report.membership.count === 1 ? '' : 's'} — {formatCents(report.membership.totalCents)}
              </p>
            </div>
            <div className={`flex min-w-48 flex-1 flex-col gap-1 rounded-lg border border-border bg-card p-3 ${includePos ? '' : 'opacity-50'}`}>
              <p className="font-medium">POS Sales</p>
              <p className="text-sm text-muted-foreground">
                {report.pos.count} sale{report.pos.count === 1 ? '' : 's'} — {formatCents(report.pos.totalCents)}
              </p>
            </div>
          </div>

          <div>
            <Label className="mb-2">By Payment Method</Label>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="w-32">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byMethod.map((m) => (
                  <TableRow key={m.method}>
                    <TableCell>{PAYMENT_METHOD_LABEL[m.method]}</TableCell>
                    <TableCell>{formatCents(m.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting || (!includeMembership && !includePos)}
            >
              Export CSV
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
