// Pure date/occurrence math for recurring series — no Prisma or Electron
// import, so it can be unit tested directly with no database involved.

export function isoDateOf(d: Date) {
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10)
}

export function addDaysIso(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDateOf(d)
}

export function combineDateAndTime(isoDate: string, time: string) {
  return new Date(`${isoDate}T${time}:00`)
}

// Every weekly occurrence date (as "yyyy-mm-dd") from startDate up through
// the last one starting at or before `horizon`. Takes horizon explicitly
// (rather than computing "now + N weeks" internally) so this stays a pure,
// deterministic function — the caller decides what "now" means.
export function computeOccurrenceDates(startDate: string, startTime: string, horizon: Date): string[] {
  const occurrenceDates: string[] = []
  for (
    let iso = startDate;
    combineDateAndTime(iso, startTime) <= horizon;
    iso = addDaysIso(iso, 7)
  ) {
    occurrenceDates.push(iso)
  }
  return occurrenceDates
}
