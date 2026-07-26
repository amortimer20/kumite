// Local-calendar-date <-> ISO instant helpers. Plain `new Date("yyyy-mm-dd")`
// parses as UTC midnight, which can land on the wrong calendar day once
// converted back to local time — these compensate so a date picked in the UI
// round-trips to the same calendar day, matching the convention already used
// in SchedulePanel.

export function todayIso() {
  return dateToIso(new Date())
}

export function dateToIso(d: Date) {
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10)
}

// Converts a plain "yyyy-mm-dd" (e.g. from an <input type="date">) into a
// full ISO instant at local midnight, safe to send over IPC and re-parse
// with `new Date(...)` on the other side without shifting a day.
export function isoDateToInstant(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toISOString()
}
