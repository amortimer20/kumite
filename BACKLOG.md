# Backlog

Feature ideas discussed but not yet implemented, roughly in the order we'd want to tackle them.

## Black belt certificate templates (1st-10th degree) still placeholders
Yellow through Brown 1st now have the studio's real certificate designs (see Done below), but no
Black-belt templates exist yet — `scripts/generate-placeholder-certificates.ts` still generates
those 10. Swap them in via `electron/certificates/ranks.ts`'s `RANK_TEMPLATES` map once real designs
exist, following the same pattern as the other ranks (drop the file in, add `namePlacement`/
`datePlacement` coordinates, remove `isPlaceholder`). Note the studio's convention is no "junior"
Black-belt certificate at all — juniors aren't graded to black belt — so these only ever need a
`regular` entry. Blocked purely on the studio owner sourcing the real template files — the swap-in
mechanism is already built and needs no further design work.

## From the pre-beta code review
Every item from that review is now fixed — see Done. The checklist is closed.

## Done

### Windows installer verified end-to-end
Real hardware, not just config review: installed 0.1.0, then built and installed 0.2.0 over it —
NSIS's `perMachine: false`/`oneClick: false` upgrade-in-place worked as expected, no admin prompt,
existing data untouched. Code-signing deliberately deferred (unsigned still shows a Windows "Unknown
Publisher" SmartScreen warning) — not a blocker for beta, revisit for a 1.0 release.

### Six pre-beta polish items
1. **Membership status had zero grace period** — `overdue` fired the instant the due date passed,
   which is wrong for a studio where students pay in person at their next lesson rather than on the
   due date itself (e.g. the 1st falling on a Sunday with the first lesson back on Saturday). Added a
   new `due` status: 7-day grace window between `due_soon` and `overdue` (`GRACE_PERIOD_MS` in
   `membershipLogic.ts`). Status is computed on the fly, not stored, so no migration. Dashboard's
   Membership Health now shows three buckets (Overdue/red, Due/orange, Due soon/amber) instead of two.
2. **DevTools was reachable in the packaged build** — no `devTools: false` anywhere, so F12/Ctrl+Shift+I
   and the menu's "Toggle Developer Tools" both worked in production. Now gated on
   `Boolean(VITE_DEV_SERVER_URL)` — off whenever not running via `npm run dev`. Verified by attempting
   `webContents.openDevTools()` directly in the packaged-style build and confirming
   `isDevToolsOpened()` stays `false`.
3. **Add Student modal could run off-screen on a shorter laptop display** — the `Dialog` primitive had
   no `max-height`/`overflow-y` at all, ever; every dialog could in principle overflow top/bottom with
   no way to scroll to its own submit button. Fixed at the primitive (`max-h-[90vh] overflow-y-auto` in
   `dialog.tsx`), not per-instance, since the same gap existed in every dialog in the app.
4. Added a static "Developer: Anthony Mortimer" line to Settings > About.
5. **Edit Student's Cancel/Save row sat above Family Members** — moved below it. The form and its
   footer are no longer the same JSX block (footer is now outside the `<form>`, after the Family
   Members section), so Save uses `form="edit-student-form"` to stay wired to the right `onSubmit`.
   Verified the wiring survives being physically outside the form element: set a field via eval,
   clicked the relocated Save, confirmed the row updated in the table.
6. Swept `HelpPanel.tsx` for staleness against recent changes: updated the Dashboard section's
   Membership Health description for the new three-status grace period, and the About section
   description to mention the developer field.

Full gate (typecheck, lint, 222 tests — 4 new/updated for the grace-period boundary) passes. Verified
live via the `run-kumite` skill: launched a packaged-style build, confirmed the DevTools no-op, saw all
three Membership Health buckets render with real seeded data landing in each one, confirmed the
relocated Edit Student footer visually and by a real submit round-trip. Two non-obvious driver gotchas
found along the way are now documented in `run-kumite`'s `SKILL.md`: a plain `.value =` assignment on a
React-controlled input doesn't stick (needs the native property setter), and a synthetic `.click()` on
a Radix `DropdownMenuTrigger` isn't reliable (used the Details dialog's own Edit button instead).

### Electron upgraded from 30 (EOL) to 43 (current)
`electron@30.5.1` was 13 majors behind and long past end-of-life, carrying unpatched Chromium and
Node CVEs. Bumped to `electron@43.3.0`, and `electron-builder@24.13.3 → 26.15.3` alongside (builder 24
predates Electron 43 and can't package it). `@electron/rebuild` was already current and rebuilt
`better-sqlite3` against E43's Node ABI automatically via the existing `postinstall`/`test` scripts.

One config gap surfaced and was fixed: the dependency-tree change dropped a transitive package that had
been silently augmenting the global TypeScript lib, exposing that `tsconfig.json` declared
`lib`/`target` as `ES2020` while the code already used `Array.prototype.at` (ES2022). Bumped both to
`ES2022` — Electron 43's bundled Node is far past that, so no downlevel concern.

The specific risk the old backlog entry flagged — ESM preload (`preload.mjs`) under Electron's
default-on sandbox — was verified clean: launched the E43 build and confirmed `contextBridge` still
exposes `window.api` (object, 15 keys) with no preload/sandbox change needed. Verified thoroughly, not
just built: full gate (typecheck, lint, 220 tests) green on the new toolchain; drove the dev build
through all 8 tabs plus real read/write IPC paths (`reports.generate`, `certificates.listAvailableRanks`,
`studentMemberships.listActive`) with zero renderer console errors; then packaged a DMG and launched the
actual packaged `.app` binary — migrations ran against a fresh userData DB, `students.list()` returned
cleanly, correct `~/Library/Application Support/Kumite` path, zero console errors. The `files` allowlist
still trims correctly under builder 26 (`app.asar` 6.4 MB, 4 runtime packages). DMG grew 101 MB → 124 MB,
expected — E43's newer Chromium framework is larger than E30's. Done on branch `upgrade-electron-43`.

### User data no longer lives in a folder named after the package
`app.getName()` read the package `name` field (`karate-app`), so the database landed in
`%APPDATA%\karate-app` (`~/Library/Application Support/karate-app` on macOS) instead of `Kumite` —
visibly wrong in Settings > About. Fixed with a `"productName": "Kumite"` field in `package.json`,
which Electron prefers over `name` when set. No migration story needed: confirmed with the studio
owner that no beta has shipped and no live data exists yet, so there's no existing folder to move.
Verified against a real packaged `.app` (not the dev build, which always uses `prisma/dev.db`
regardless of this field) — `appInfo.get()` now reports
`~/Library/Application Support/Kumite/karate-app.db`. Full gate (typecheck, lint, 220 tests) passes;
no test coverage added since this is a single static config field, not application logic.

### The installer no longer ships bundled libraries a second time
`electron-builder.json5`'s `files` list used to be just `["dist", "dist-electron"]` — which reads like
an allowlist but isn't one, since electron-builder always additionally walks `package.json`
"dependencies" and copies each one's real `node_modules` folder in regardless of what `files` says.
Vite already inlines every one of those dependencies into `dist/assets` (renderer) or `dist-electron`
(main) *except* `better-sqlite3` and `@prisma/adapter-better-sqlite3` (marked external in
`vite.config.ts`, since a native module can't be bundled) — so `date-fns`, `lucide-react`,
`@radix-ui`, `react-day-picker`, `pdf-lib`, and `better-sqlite3`'s own install-time tooling
(`prebuild-install` and its whole fetch/decompress dependency tree) were all being packaged as raw,
never-loaded source on top of the bundle that already contains them.

The fix traces the *actual* runtime `require()` graph of the two real externals by hand, rather than
trusting their declared dependencies (`better-sqlite3` declares `prebuild-install`, but that only runs
during `npm install` to fetch a prebuilt binary — nothing at runtime calls it): `better-sqlite3` →
`bindings` → `file-uri-to-path`, and `@prisma/adapter-better-sqlite3` → `@prisma/driver-adapter-utils`
→ `@prisma/debug`. `files` now explicitly excludes all of `node_modules` and re-includes only those,
plus — since `better-sqlite3`'s own package is 28 MB and only ~60 KB of that (`lib/`) plus one compiled
binary are needed at runtime, the rest (`deps/`, the SQLite C source it was compiled from; `src/`, the
addon's own C++; and most of `build/`, the compiler's intermediate object files) exist solely to
produce that binary — an explicit narrower path for `better-sqlite3` itself (`package.json`, `lib/**/*`,
and `build/Release/better_sqlite3.node` only).

Verified end-to-end, not just by reading the config: a baseline packaged build measured `app.asar` at
81 MB (matching the last release-hygiene pass) with 64 top-level `node_modules` packages and 12,496
files inside it; after the change, the same build produced a 6.4 MB `app.asar` (down from 81 MB), a
2.1 MB unpacked folder (down from 24 MB), a 101 MB DMG (down from 116 MB — Electron's own ~96 MB
framework is the floor, as the original entry predicted), and exactly the four packages expected
(`better-sqlite3`, `bindings`, `file-uri-to-path`, `@prisma`) across 69 files. Then the actual packaged
`.app` binary — not the dev build — was launched directly (Playwright's `_electron.launch` pointed at
`Kumite.app/Contents/MacOS/Kumite`) and exercised: the Students tab loaded real data through the
trimmed `better-sqlite3`/`@prisma/adapter-better-sqlite3` stack, and the Certificates tab rendered
correctly. `extraResources` (certificate templates, migrations) are a separate config block untouched
by this change and were confirmed still present in the packaged output. Full gate (typecheck, lint,
220 tests) passes; no test coverage added since this is packaging configuration, not application code.

### Most api.* failures are no longer silent
The global `unhandledrejection` toast (see below) was the safety net; this closes the two gaps it
didn't replace. First, every panel's *initial* data fetch was uncaught, so a failed load didn't fail
loudly — it rendered the confidently-empty defaults as if they were real answers. `DashboardPanel`
would show "0 Active students", "$0.00 Collected this month", and "All memberships are up to date";
`StudentMembershipDialog` would show "This student doesn't have a membership yet" for a student who
has one. A new shared `LoadErrorBanner` (message + Retry button) now replaces that confidently-wrong
content across every panel with an initial load: `DashboardPanel`, `StudentsPanel`, `InstructorsPanel`,
`PosPanel`, `CertificatesPanel`, `StudentMembershipDialog`, `SchedulePanel` (both its form-data lists
and, separately, the lessons table itself), and `SettingsPanel` (each of its four independent loads —
hours, plans, backup settings, and about — gets its own banner and Retry, so one failing doesn't hide
the others). Second, most non-submit mutating handlers (reactivate, delete, family-member edits, plan
archive/reactivate, the auto-backup checkboxes/selects) had no `try/catch` of their own and relied
entirely on the generic global toast; they now follow the same `catch (err) { toast.error(getErrorMessage(err)) }`
convention every `onSubmit` already used.

Two real bugs turned up along the way, not just missing catches. `CertificatesPanel`'s certificate-type
switch set `certificateType` before its ranks fetch resolved, with no rollback — a failed fetch left
the type pointing at "junior" while `availableRanks` still listed regular-only ranks, letting a
mismatched rank get selected; it now reverts the type on failure. `SchedulePanel`'s inline lesson-notes
editor closed itself *before* the save resolved, so a failed write silently discarded the typed note
with no way to recover it beyond the generic toast; it now stays open until the write actually
succeeds. Verified by temporarily throwing inside `students:list`, rebuilding, and screenshotting both
the Dashboard and Students tab showing the new banner with a working Retry, then reverting and
re-verifying the normal path renders exactly as before. No new tests — same reasoning as the
stale-response-race guards below: these are component-lifecycle behaviors with no renderer test
infrastructure, verified by typecheck, lint, the full suite (220 tests, unchanged), and this manual
fault-injection pass.

### Non-traditional membership fees — paid extra lessons and proration
The last feature-shaped gap before the app was feature-complete for its first iteration. Two related
additions, both riding on the `MembershipCharge` ledger (see below) — each is just a one-off row on it.

**Paid extra lessons.** A new "Charge for an extra lesson" form in the Membership dialog, distinct from
the existing free-form `+/- lessons` adjustment (still there, for a genuinely comped bonus lesson or a
correction — no money involved). One atomic transaction, three legs: a one-off `MembershipCharge` (kind
`extra_lesson`, so it reads as its own dated line rather than folding into a total), a `MembershipPayment`
(so the money lands in the existing membership-dues revenue line — no third top-level revenue source
needed, and CSV export/include-toggles stay as they are), and a positive `MembershipUsageAdjustment`
delta for the allowance (already period-scoped, so it expires at period end same as any bonus lesson —
"use it or lose it" needed no new work, since that was already how the app behaved). The charge leg is
not optional: a payment with no matching charge would be read as prepayment toward dues and silently
reduce what's owed next month, the same phantom-credit failure mode fixed for plan switches in
"Membership billing no longer re-bills the past" below. Price is typed in per transaction (the studio has
no fixed rate) and pre-fills from the last extra-lesson amount charged to that student — a new
`lastExtraLessonPriceCents` field on `StudentMembership`, computed from the most recent `MembershipCharge`
of that kind, so staff aren't retyping the same figure from memory.

**Proration.** Signing up mid-month on a monthly plan now defaults to prorating the partial first month
— checked on by default rather than opt-in, matching the studio's stated norm ("billed on the 1st should
be the default"); staff can edit the suggested amount or uncheck it for an immediate, non-prorated start.
The suggestion is `round(monthlyPrice x daysRemaining / daysInMonth)` (`suggestProratedChargeCents` in
`src/lib/membershipFormat.ts`, counting the join day itself as one of the remaining days), and choosing to
prorate moves the actual `startDate` sent to the server to the 1st of the next month
(`startOfNextMonthIso` in `src/lib/isoDate.ts`) while the agreed stub is materialized as a one-off
`MembershipCharge` (kind `proration`) in the same transaction as the membership itself. Offered only for
monthly plans — weekly/biweekly periods are short enough that a stub isn't worth the complexity, and the
studio's answer only described the monthly case. Folded in the backlog's noted prerequisite along the
way: the assign form's start-date default was a module-level `todayIso()` evaluated once at import time,
stale on a front-desk machine left running for days; it's now computed fresh every time the dialog opens.

Both additions needed one thing the ledger didn't have yet: a way to tell a charge that needs explaining
apart from an ordinary period charge. Added `MembershipCharge.kind` (`period` / `opening_balance` /
`proration` / `extra_lesson` — a real discriminator, not string-matched off the display label, since
`lastExtraLessonPriceCents` reads it back for logic) and `label` (the human-readable text — "Opening
balance", "Prorated first month", "N extra lesson(s)" — left null for ordinary period charges, which
don't need explaining beyond their own `periodStart`/`periodEnd`). Both migrations are purely additive.

Coverage: `suggestProratedChargeCents`/`startOfNextMonthIso`/`isFirstOfMonthIso` are pure and unit
tested (including a leap-year February and joining on the last day of the month). `chargeExtraLesson` and
`assignMembership`'s proration path are covered in `memberships.test.ts` against a real migrated
database — the charge-and-payment-cancel-out case (dues owed unchanged, allowance up by N), the
`lastExtraLessonPriceCents` pre-fill tracking the two most recent charges in turn, the proration stub
landing as its own row with no `periodStart`, and both being rejected below zero. HelpPanel's Students
section documents both flows. 220 tests pass.

### The membership billing ledger
`amountOwedCents` used to be pure arithmetic — `priorChargesCents` + (periods elapsed since `startDate`
x snapshotted price) - total paid — recomputed fresh on every read with nothing stored in between. A new
`MembershipCharge` table now records one row per billing period actually charged, at the price that
applied when it was charged, and the balance is computed by summing those rows against payments instead
of deriving them. Behavior is unchanged (see below); this was purely an internal readability move, per
the entry's original framing.

**Materialization.** Charges are created lazily — `ensureChargesMaterialized`, called at the top of
every balance read, walks every period from `startDate` through now and inserts a row for any that don't
already have one, at the membership's current effective price. This mirrors exactly how the balance used
to be recomputed fresh on every read; it's just materialized into rows instead of an in-memory formula.
A `@@unique([studentMembershipId, periodStart])` constraint makes double-charging a period structurally
impossible, and the whole operation runs in one transaction so two reads racing the same membership can't
create the same period twice. A price or cadence change (`applyPlanTermsToActiveMemberships`,
`updateMembership`'s cadence switch) now closes out the old term by materializing its real per-period
rows at the OLD price *before* moving the anchor, replacing the old `chargesForTerm` scalar arithmetic —
so a mid-history price change is preserved with full period-by-period detail instead of being flattened
into a lump sum the moment it closes.

**The one honest limitation.** History already banked into `priorChargesCents` before this feature
existed has no recoverable per-period breakdown — only a running total was ever kept, never what each
period cost. The first time a pre-existing membership's charges are materialized, that value is folded in
as a single "opening balance" row (`periodStart`/`periodEnd` both null) rather than reconstructed period
by period, since the original prices and boundaries for that era are simply gone. Every charge from that
point forward has full detail. `priorChargesCents` itself is left in the schema, deliberately unused,
since dropping it in the same release that introduces the table it seeds from would destroy the value
before a real deployment's startup ever got to read it — safe to remove in a later release once that's
no longer a risk.

**Proving zero behavior change.** The old formula assumed one price applied uniformly to every elapsed
period since `startDate`; the new one sums real per-period rows and is provably identical whenever that
assumption held (which is every case the app already supported — the migration guarantees each
materialized row is priced at exactly what the old formula would have used for that period). The trickiest
part wasn't the sum — it was `nextDueDate`, which needed a proper FIFO walk (allocate payment against
charges oldest-first, stopping at the first one not fully covered) rather than the old single-price
`floor(paid / price)` shortcut, since charges can now legitimately carry different prices across a
membership's history. 21 of the 22 pre-existing `memberships.test.ts` tests passed unchanged the moment
the switch was made — including every plan-price-change and cadence-switch regression test from
"Membership billing no longer re-bills the past" below — which is the actual proof this didn't change
anyone's balance. Three assertions checked `priorChargesCents` directly rather than a real behavior;
only one of those actually failed (the other two happened to still pass, since the field is frozen at 0
and never written anymore — coincidentally right, not meaningfully tested), but all three were rewritten
to check the ledger rows instead. New coverage: `computeOwedFromCharges`
gets the same scenarios `computeMembershipBalance` had plus a mixed-price-history case, and
`memberships.test.ts` gets dedicated ledger tests (one row per elapsed period, no double-charge across
repeated reads, the legacy value seeding exactly one opening-balance row). 202 tests pass.

Unlocks, now that the data exists: the non-traditional-fees design below no longer needs its own
"proration fits `priorChargesCents`" argument — a proration stub or a paid extra lesson is just a one-off
`MembershipCharge` row, the same mechanism the ledger already uses for its own opening balance. A
"why does this student owe this" view in the Membership dialog is now a cheap follow-up (the data is
already there), but wasn't built in this pass since the backlog item itself was scoped to the data model.

### Automatic backups no longer fail invisibly, and a partial write can't pass as a valid backup
Two gaps in `electron/autoBackup.ts` and `electron/ipc/backup.ts`, both compounding the fact that
backups are the only recovery path this app has. First, `backupDatabaseTo` (shared by the manual
"Export Backup" button and the automatic scheduler) used to write straight to the final timestamped
filename, so a write interrupted by a pulled USB stick, a lost network-drive connection, or the app
quitting mid-copy left a correctly-named file that looked like a backup but wasn't. It now writes to a
`<name>.partial` sibling, runs a `PRAGMA integrity_check` against it, and only renames it into place on
success — an interrupted write is discarded and the caller gets a clear error instead of a silently
useless file. The `.partial` suffix also means an interrupted attempt is never picked up by the restore
file picker or counted by `backupsToPrune`'s retention logic, since it matches neither naming pattern.

Second, every automatic-backup failure was swallowed to `console.error` with `lastAutoBackupAt` only
written on success, so a folder that stopped resolving failed forever while Settings kept showing an
increasingly stale "last backup" date — the user's mental model stayed "backups are on" long after they
weren't. A new `AppSettings.lastAutoBackupError` column now records the failure message and is cleared
on the next success; Settings shows it as a red message right under the schedule (only while automatic
backups are still configured), naming what's wrong and suggesting a check of the folder. Restoring
already validates the file it's given, so a bad backup couldn't have bricked the app before this — but
it could have been a backup the studio thought they had and didn't, which is the failure mode this
closes. Coverage: `backupDatabaseTo` gets a real-database integrity-check round trip plus a test that
injects a corrupted write (via a `better-sqlite3` backup-method stub) and asserts nothing is left at
either the destination or the `.partial` path; `autoBackup.test.ts` covers the error being recorded on
failure without a false success timestamp, and cleared the next time a backup succeeds. 195 tests pass.

### Global unhandled-rejection safety net for failed api.* calls
Most `onSubmit` handlers wrap their `api.*` call in `catch (err) { toast.error(getErrorMessage(err)) }`,
but many non-submit handlers didn't, so a failed IPC call became an unhandled promise rejection with no
user feedback — the click just appeared to do nothing. `src/main.tsx` now registers a
`window.addEventListener('unhandledrejection', …)` that toasts `getErrorMessage(event.reason)` for any
rejection no local handler caught. It reuses the same message-cleanup helper as the inline handlers, and
because a local `catch` stops the rejection from ever reaching the window, it never double-reports. The
console error is left intact for diagnostics. This is the safety net only; tightening individual
handlers to manage their own failures inline (and roll back optimistic UI) stays on the Backlog.

### Recurring series edge cases
Three separate bugs in `electron/ipc/recurringSeries.ts`, all of which could silently lose or
mis-create lessons. First, `extendAllActiveSeries` (the startup extender) advanced `generatedUntil`
unconditionally, including on the path that *skips* a week for a conflict — so a week blocked by a
one-off double-booking fell behind the high-water mark and was never retried on any later startup,
even after the conflict was removed. It now advances the mark only across the leading run of settled
weeks (created, already-generated, or in the past) and locks it at the first *future* week it has to
skip, so that week is retried next startup while later weeks still generate in the meantime. An
`existing`-lesson check was added so re-scanning already-generated weeks doesn't create duplicates or
stall the mark on the series' own lessons.

Second, `createRecurringSeries` threw a cryptic Prisma error when the start date was beyond the 12-week
rolling window: no occurrences were generated, so `lastOccurrence` was undefined and
`combineDateAndTime(undefined, …)` produced an Invalid Date. It now rejects up front with "that start
date is too far ahead — recurring lessons can only be scheduled up to 12 weeks out."

Third, a back-dated series generated occurrences from `startDate` forward including past weeks, which
were inserted as `scheduled` lessons that count against the student's included private lessons for the
current period — silently spending a paid allowance. Creation now keeps the weekly cadence anchored on
the start date but only materialises occurrences from today forward, and the same "never create a past
week" guard was added to the startup extender for the case where `generatedUntil` is left stale by the
app being closed for a while. Four integration tests in `recurringSeries.test.ts` cover the
retry-after-conflict-clears path (including no duplicates on the second run), the too-far-ahead
rejection, the back-dated skip, and the stale-`generatedUntil` past guard. HelpPanel's Schedule section
now notes the 12-week window and the today-forward behaviour. 190 tests pass.

### Stale-response races in three dialogs
`SchedulePanel.tsx` already guarded its lessons fetch with a `lessonsRequestIdRef` counter — bumped per
request, with responses whose id no longer matches the latest dropped rather than applied. Three other
places fetched keyed on a changing selection with no such guard; they now use the same pattern.
`StudentMembershipDialog.tsx` was the important one: open student A (slow query, long payment history),
close, open student B, and A's membership, amount owed and payment history could land last and render
under B's name — and because the payment form reads `membership.id` off that stale object, a payment
recorded there posted to A's membership. `refresh()` now bumps a `requestIdRef` and discards its own
result if a newer refresh (a student switch, or a mutation's own refresh) has since fired; the open
effect also clears `membership`/`paymentHistory` up front, so a slow or failed load can no longer leave
the previous student's figures showing under the new name. `StudentsPanel.tsx`'s per-student Lessons
dialog got the same guard (and clears `studentLessons` on open) so A's lessons can't render under B's
title with Delete acting on A's, and `ReportsPanel.tsx`'s `handleGenerate` guards so clicking "This
Year" then "This Month" can't let the slower earlier range win.

No tests: these are component request-race guards tied to React lifecycle rather than extractable pure
logic (the existing `SchedulePanel` guard has no test either, and there's no renderer test
infrastructure), and the dev server can't exercise these panels without `window.api`. Verified by
typecheck, lint, and the full suite (186 tests) as a regression check.

### Server-side validation on the handlers that lacked it
`lessons.ts`, `pos.ts` and `memberships.ts` guarded their input; `students.ts`, `instructors.ts`,
`familyMembers.ts`, `businessHours.ts` and `settings.ts` didn't. Added `assertValid*` guards in the
same shape as the existing ones (checked only when a field is present, so one guard serves both create
and update). Students, instructors and family members now reject an empty or whitespace-only first/last
name — `students:create` previously accepted a blank `firstName` that then rendered as an empty row
everywhere. `businessHours:update` rejects a close time at or before the open time on an open day,
which used to save silently and make the Schedule availability grid render nothing for that day; the
subtlety is that the renderer patches one field at a time, so the guard lives in a new exported
`updateBusinessHours` that validates the row *after* merging the patch over the stored values (or the
schema defaults). `settings:update` rejects a nonsensical `autoBackupKeepCount` (zero/negative/
fractional) rather than storing junk that `backupsToPrune` would then have to fail-safe around.

Folded in a companion UI fix so the business-hours guard is actually surfaced: `SettingsPanel`'s
`handleChange` updated state optimistically and awaited with no catch, so a rejected write would have
left the UI showing a value the database refused. It now rolls the optimistic change back and toasts
the error — the one non-`onSubmit` `api.*` caller in that file (the broader silent-`api.*`-failure
sweep is still its own Backlog entry). Coverage: pure assert tests for students/instructors/
familyMembers/settings, and `businessHours.test.ts` covering both the pure comparison and the
merge-then-validate path (a close-time-only patch is checked against the stored open time and the
rejected write leaves the row untouched). 186 tests pass.

### The last of the highest-risk untested logic now has tests
Closed out the "Highest-risk untested logic" backlog entry with three more test files, all against the
existing node-environment vitest config (no renderer infra). `electron/ipc/lessons.test.ts` (9 tests)
covers `assertNoOverlap` — a real overlap throws, a back-to-back lesson where `end === next start`
does *not* (both range checks are strict), a cancelled lesson never blocks, `excludeLessonId` stops a
lesson conflicting with itself on update, and different instructors don't collide — plus the
`lessons:update` merge semantics: a key absent from the partial update keeps the existing value while
an explicit `null` clears it (probed both ways on an intro lesson's optional phone), the end-after-start
guard, and the type-switch that drops a student when a private lesson becomes a group one. Testing the
merge meant extracting the `lessons:create`/`lessons:update` bodies into exported `createLesson`/
`updateLesson` functions with thin `ipcMain.handle` delegates, the same shape `pos.ts` and
`instructors.ts` already use. `electron/autoBackup.test.ts` (6 tests, `vi.useFakeTimers()` +
mocked backup/DB/fs) pins `reconfigureAutoBackup`: nothing scheduled when disabled or with no folder,
one backup immediately on enable, one per interval tick, the timer cleared when reconfigured to
disabled, and — the important one — the old interval replaced (not left running alongside) when the
frequency changes. Finally `buildScheduleRows` was extracted from `SchedulePanel.tsx` into
`src/lib/scheduleRows.ts` (a behaviour-preserving move) and given 8 tests for the gap arithmetic: a
cancelled lesson doesn't consume its slot, a lesson running past closing produces no negative trailing
gap, overlapping lessons never yield a zero/negative gap, back-to-back lessons leave no gap between
them, and unsorted input is ordered first.

### The revenue report now has tests
`computeReport` and `buildCsv` in `reports.ts` had zero coverage despite being a money path the studio
hands to their accountant. `electron/ipc/reports.test.ts` (8 tests, real throwaway migrated DB via
`createTestDb`, same pattern as the other IPC tests) now locks in the two things most likely to break
silently. First, the inclusive end-date boundary: a payment at 23:59 on `endDate` is counted and one
the next midnight isn't (and the same for a POS sale, which is queried on a different column,
`createdAt`), plus the low end — a payment the day before `startDate` is excluded. This is the whole
reason `rangeToInstants` uses `lt` the *next* day rather than `endDate`'s own midnight; get it wrong
and every report drops its last day. Second, that `buildCsv`'s Combined Total and payment-method rows
honour the `includeMembership`/`includePos` flags across all four combinations — the one place CSV
output can silently disagree with what's on screen. `buildCsv` was made `export` to test the flag
logic directly on a hand-built `Report` (it's pure), same precedent as the exported POS functions. A
breakdown test also pins `normalizeMethod`'s report-level behaviour: freeform `MembershipPayment.method`
casing is normalized and unknown/null values bucket into "other". Leaves `assertNoOverlap` and
`buildScheduleRows` as the remaining untested-logic targets (see Backlog).

### Raising a plan's price can now be applied to students already on it
Plan edits stay grandfathered by default — existing members keep the price they signed up at, so an
edit still can't rewrite past billing. What was missing was any way to *opt in* to raising the price
for current members short of hand-editing each one. Saving a plan's price or billing-frequency change
now, when there are students on the plan, opens a follow-up prompt: "Apply the new price to current
members?" Choosing **Not now** leaves grandfathering exactly as before; choosing **Apply** re-prices
everyone on the plan.

The guarantee is "new price from the next billing date," never a rewrite of the past.
`applyPlanTermsToActiveMemberships` (in `electron/ipc/memberships.ts`, one transaction over all active
memberships on the plan) banks everything charged through the current period at the member's *old*
price into `priorChargesCents`, then re-anchors `startDate` to the current period's end and snapshots
the plan's new price/cadence. So past and current periods keep the old price and the new price starts
at the next due date — and because the anchor is the period's end rather than `now`, a monthly
member's billing day doesn't shift to whatever day prices were raised (the one deliberate divergence
from the cadence-switch mechanism in `updateMembership`, which uses `now` because its cadence is
changing anyway). Members with a manual `priceOverrideCents` are skipped — that price is a deliberate
per-student arrangement — and a not-yet-started (future-dated) membership just adopts the new terms
from its existing start rather than being re-anchored, which would have swallowed its first period.
Four integration tests in `memberships.test.ts` cover the paid-up re-price, a behind member keeping
the same owed amount (current period stays at the old price), the custom-price skip (and that it's not
counted), and the future-start case. HelpPanel's Settings section documents the prompt, and the
edit-plan dialog's copy now points to it.

### POS money paths now have tests
`electron/ipc/pos.ts` was the one all-money handler with zero coverage, despite already being
refactored into exported functions so tests were nearly free. `electron/ipc/pos.test.ts` (7 tests,
against a real throwaway migrated SQLite DB via `createTestDb`, same pattern as
`instructors.test.ts`) now locks in the properties that matter: a completed sale keeps its
snapshotted `unitPriceCents`/`totalCents` after the catalog item is repriced (the whole reason
`PosSaleItem` snapshots name and price); `createPosSale` throws when an `itemId` no longer exists,
and `assertValidSaleInput` (exercised through `createPosSale`) rejects an empty cart, a non-integer
quantity, and a zero/negative quantity; and `deletePosItem` hard-deletes an unsold item but archives
one that's been sold, on the P2003 FK-violation fallback. Leaves `computeReport`, `assertNoOverlap`,
and `buildScheduleRows` as the remaining untested-logic targets (see Backlog).

### Payment history filters to a recent window by default
A student's payment history spans every membership they've ever had and only grows, so an established
student's list became a long scroll to eyeball recent activity. The Membership window's payment-history
table now defaults to the **last 12 months**, with a dropdown to switch to the last 90 days or all
time, and a "Showing 3 of 20" counter so a filtered view can never be mistaken for lost data (when the
range covers everything it just reads "20 payments"). An empty window says so and points at choosing a
wider range, rather than looking like the student has no history.

Default is 12 months rather than the 90 days first floated, because 90 days is only ~3 rows for the
common monthly cadence and reads as "where did it all go?"; a year is bounded but rarely empty. Kept
client-side — all payments are already fetched, and even weekly billing over years is only a few
hundred rows, so backend pagination wasn't worth its complexity. The date-window logic is a pure
`filterPaymentsByRange` in `src/lib/paymentHistoryFilter.ts` with 8 tests covering the cutoffs and the
inclusive boundary (a payment dated exactly at the cutoff is kept). HelpPanel's Students section
documents the filter.

### Startup watchdog so a wedged launch can't hang silently forever
This began as a "watch item": once, while verifying the packaged mac build right after the
single-instance lock went in, the app printed Chromium singleton errors (`write() failed: Broken pipe`,
`Failed to extract pid from path: .../SingletonLock`), took the lock, and then never ran the startup
migrations — no window, no database, process alive and idle indefinitely — after several `kill -9`/
relaunch cycles in quick succession, so the previous instance's `SingletonSocket` was likely being torn
down mid-negotiation. It was never reproducible (a clean start migrates in ~1s; a deliberate `kill -9`
then immediate relaunch takes the lock cleanly), and it isn't fixable in our code: the race is inside
Electron's `app.requestSingleInstanceLock()` machinery, not ours. So rather than chase a repro that a
studio would never trigger, we bounded the *symptom* — an app that runs but does nothing, forever,
which at a front desk is indistinguishable from being broken.

`electron/startupWatchdog.ts` arms a timer **before** `app.whenReady()` (the failure hypothesis is that
`whenReady()` never resolves, so a watchdog inside that callback would never fire in exactly the case it
exists for). If startup hasn't completed within 30s — ~30x the normal path — it shows a "taking too long
to start" dialog and exits non-zero, so the hang becomes a visible failure the user can retry, which a
clean relaunch clears. The timer is disarmed the moment `startupComplete` flips true. The Electron bits
(dialog, exit) are injected via an `onTimeout` callback, keeping the module a pure function that 4 unit
tests drive with fake timers (fires on timeout, not before, not once disarmed, and a guard against
acting if startup finished in the same tick).

If the underlying race ever *does* recur, the diagnostic notes from the original sighting still hold:
check whether `app.whenReady()` resolves at all; a `--user-data-dir` conflict or a stale
`SingletonSocket` in `%APPDATA%`/Application Support is the likely culprit, and deleting the three
`Singleton*` entries clears it. One related design tension is unchanged and deliberate: `reportFatalError`
uses the blocking modal `dialog.showErrorBox`, so an early crash shows a dialog and waits — correct when
someone is at the keyboard (the front-desk norm), and the watchdog's own dialog shares that property.

### Money inputs can no longer overflow the Int columns
Every price and count in the app is stored as a Prisma `Int` — a signed 32-bit integer, max
2,147,483,647. A fat-fingered amount past that ceiling used to reach the database and surface a raw
Prisma overflow message in a toast, which reads as a broken app rather than "that number's too big."
The guard now lives in the two shared parse helpers in `src/lib/membershipFormat.ts`, so it covers
every money-input site at once: `parsePriceToCents` (plan price, catalog item price, custom membership
price override, and payment amount) returns `null` above the ceiling, which every caller already
turns into its existing inline "enter a valid price" validation message — so no new UI code was
needed. `clampNonNegativeInt` (a plan's included-lessons count) now clamps at the top end as well as
the bottom, symmetric with its existing floor at 0. A shared `MAX_INT_COLUMN` constant documents the
limit in one place. Six unit tests cover the ceiling on both helpers, including the exactly-at-limit
boundary.
Cart lines hold a snapshot of the catalog item taken at add-to-cart time, but checkout re-reads the
catalog server-side and snapshots the price there. So editing an item from Manage Items while it sat in
the cart left the running total — and the "Sale completed — $X" toast — showing a figure the recorded
sale didn't use: staff could quote and collect the wrong amount, and Recent Sales would immediately
contradict the toast. The server side was always right; only the display was stale.

`refresh()` now re-points each cart line at the current catalog row via `reconcileCart` in
`src/lib/posCart.ts` (pure, 6 tests). It lives in `src/lib` rather than `PosPanel.tsx` because exporting
a non-component from a component file trips the `react-refresh` rule the lint gate enforces.

Two deliberate calls: a line whose item was **deleted** is dropped and named in a warning toast, because
checkout would reject it anyway and failing at the till is worse than being told up front; a line whose
item was merely **archived** is kept, because it still exists, the sale completes, and silently removing
something mid-transaction is more surprising than finishing it. The function also returns the original
array by reference when nothing differs, so an unchanged cart isn't needlessly replaced on every refresh.

### Confirm before deleting a lesson that already happened
Deleting a one-off lesson went straight through with no dialog, so scrolling the schedule back to check
who attended and mis-clicking Delete destroyed an attendance record instantly, with no undo. The rest of
the codebase deliberately protects real outcomes — `deleteRecurringSeriesFrom` and `deleteInstructor`
both exclude `completed`/`no_show` — so this was the one path that didn't.

The old comment argued one-off deletes are "routine, low-stakes"; that's true of a future booking and
false of a past one, so the split is now on **whether the lesson has happened**, not on whether it's
recurring. `lessonHasHappened` in `src/lib/lessonStatus.ts` is a pure predicate with tests: `completed`
and `no_show` count as happened regardless of the stored time (the status is a statement that it did),
and everything else falls back to whether the start time has passed — which matters because staff
routinely forget to mark attendance, so a week-old lesson still sitting at "scheduled" is history too.

Also wrapped this hook's two `api.*` calls in the standard `getErrorMessage` + toast handling while
there. It was the only file in the app calling `api.*` without even importing `getErrorMessage`, and a
delete that silently fails is exactly the wrong place to leave that.

### Error boundary so a crash can't blank the window
A render-time throw used to take out the whole window with no message and no way back — the worst
failure mode at a front desk, because it's indistinguishable from the app being broken beyond use.
`src/components/ErrorBoundary.tsx` now catches it and shows what went wrong, the error text to pass on,
and a Reload button.

Used in two places for different reasons. In `App.tsx` it wraps the panel area with `key={tab}`, so the
boundary remounts when the user switches tabs: a crash in one panel leaves the navigation working and
moving to another tab clears it, no reload needed. In `main.tsx` it wraps the whole app as a last
resort, for a crash in the shell itself where there is no surviving navigation to escape through.

Verified by temporarily making a panel throw, rather than trusting that it compiles: the boundary caught
it, the scoped wording named the Dashboard, the navigation stayed usable, and switching to Schedule
rendered normally. A class component because `componentDidCatch` has no hook equivalent, and it still
logs the component stack to the console, which is the only diagnostic available in a packaged build.

### Restore safety copies are surfaced in the UI
Restoring a backup renames the outgoing database to `<name>.pre-restore-<epoch>` rather than
overwriting it, which makes it the only way to undo a restore of the wrong file — but nothing in the
app said it existed. Settings > Backup & Restore now explains it above the buttons, pointing at the
About section for the folder, and the Help panel's Settings section says the same plus "don't delete it
until you're sure the restore was right." Copy only; the mechanism already worked. Pruning those files
is still not handled, and is deliberately left alone — they're small relative to the risk, and
automatically deleting the one available undo would defeat the point.

### A real README
Replaced the unmodified Vite starter template with actual documentation: what the app is, the setup
steps, a table of every npm script, where the database lives in development versus in a packaged
install, the directory layout, how tests are organised, and the Windows/unsigned-installer story.

Two things worth having written down that weren't anywhere before. First, the `better-sqlite3` rebuild
dance — Node and Electron have incompatible ABIs, so `npm test` rebuilds for Node, runs Vitest, then
rebuilds for Electron; the practical rule is "run tests with `npm test`, never bare `npx vitest`",
because the latter fails with a `NODE_MODULE_VERSION` mismatch that looks like a broken test suite
rather than a toolchain state problem. Second, a Notable Conventions section capturing the decisions
that are easy to violate by accident: money as integer cents, dates via `src/lib/isoDate.ts`,
archive-instead-of-delete, historical rows snapshotting their own values, no runtime schema validation,
and that `HelpPanel.tsx` is the user documentation and should change in the same commit as the feature.

Every documented step was verified against a genuinely fresh `git clone`: `npm install` (whose
`postinstall` generates the Prisma client and rebuilds the native module), `cp .env.example .env`,
`db:migrate`, `db:seed`, then typecheck, lint, and the full test suite — all green, with no manual
steps beyond what the README lists.

### Automatic backup retention
Settings > Backup & Restore has a "Backups to keep" dropdown next to Frequency: keep the last 10, 30,
60, 100, or **Keep all**. Default is 30, which at the default Daily frequency is roughly a month of
history. Counts rather than an age cap ("older than 30 days"), because the problem being solved is
unbounded folder growth and only a count bounds disk use predictably at the Hourly setting — the two
settings do interact, and the Help text says so. "Keep all" exists deliberately: deleting backups is
destructive, it's what the app did before this existed, and the user should be able to opt out rather
than have pruning imposed. Stored as `AppSettings.autoBackupKeepCount`, nullable, where null means keep
everything.

The decision of *what* to delete is a pure exported function (`backupsToPrune`) with 13 tests, rather
than logic buried in the filesystem call — deleting the wrong file here is unrecoverable. Two
safeguards worth noting: it matches only `kumite-auto-backup-*.db` anchored at the start, so a manual
"Export Backup" file (`kumite-backup-<date>.db`) can never be pruned even though its name is similar,
and an invalid retention value (0, negative, non-integer) deletes *nothing* rather than everything.
Ordering is by filename, not mtime — the names are ISO-timestamped so they sort chronologically, and
mtime is unreliable in exactly the synced OneDrive/Dropbox folder the UI recommends, since a sync
client re-downloading a file rewrites it. Pruning runs after a successful backup in its own try/catch,
so a permissions error while deleting can't make a backup that actually succeeded look like a failure.

### Release hygiene pass: lint gate, installer size, native module, startup polish
A batch of small fixes from the pre-beta review, all release-facing rather than behavioural.
`npm run lint` now passes for the first time — `--max-warnings 0` had been failing on shadcn's own
convention of exporting `buttonVariants` beside the component, so `react-refresh/only-export-components`
is now off for `src/components/ui/**` only, rather than deleting an export `ui/calendar.tsx` needs.
`asarUnpack` now extracts `better-sqlite3`, so the native binary is a real file on disk instead of
relying on Electron copying a DLL out of the asar into `%TEMP%` on every launch — the main
antivirus/AppLocker risk on a managed Windows machine. Moving `@prisma/client`, `shadcn`, `tailwindcss`,
`@tailwindcss/vite` and `tw-animate-css` to `devDependencies`, plus cleaning `dist` and `dist-electron`
at the start of `build`, took `app.asar` from 243 MB to 81 MB and the DMG from 160 MB to 128 MB.
Removing `@prisma/client` from the package is safe and was verified two ways: `vite.config.ts` marks
only `better-sqlite3` and `@prisma/adapter-better-sqlite3` as external, so the generated client is
inlined into `main.js`, and the built bundle contains no runtime reference to the package at all.
`postinstall` now runs `prisma generate`, `dotenv` is a declared dependency instead of resolving by
accident through hoisting, and `.env.example` documents `DATABASE_URL` — so a fresh clone builds.
Added `author` and `description` so the Windows installer and Programs & Features entry stop showing a
blank Publisher. The window now opens at 1280x860 with a 960x640 minimum instead of Electron's cramped
800x600 default. And the last Vite template leftovers are gone: the dead `main-process-message` IPC
send, the one commented-out line in the repo, the default `/vite.svg` favicon (now the real
`icon.png`), and two unreferenced `public/electron-vite*.svg` files that were being copied into the
packaged app. Verified with a packaged build and a fresh-install launch: 16 migrations applied,
`integrity_check` ok, 82 tests passing.

### Membership billing no longer re-bills the past
The balance is recomputed from `startDate` on every read, and it used to read the plan's *current*
price and cadence — so editing a membership plan retroactively rewrote every past period for every
student on it. Raising a plan from $100 to $120 invented back-debt for everyone enrolled and flipped
paid-up students to overdue; changing monthly to weekly recounted a $700-paid student as owing $2,000;
and switching a student to a plan with a different cadence re-read their old payments as credit against
the new price, handing out months of free membership.

`StudentMembership` now snapshots `billedPriceCents` and `billingFrequency` at assign time (and
re-snapshots when the student is moved to a different plan), so plan edits apply to new sign-ups only —
the grandfathering behaviour chosen deliberately over auto-applying changes, since past periods must
never be re-priced. A third field, `priorChargesCents`, banks what a closed term charged when the
billing anchor is reset, keeping `owed = (ever charged) - (ever paid)` instead of letting pre-reset
periods stop being owed. Existing rows were backfilled from their current plan, which is exactly what
the math was already using for them, so no student's balance changed on migration. The plan edit dialog
and Help now state that changes apply to new sign-ups only, so a price change doesn't look like it
silently did nothing. See Backlog above for the two follow-ons this leaves.

### In-app Help panel
A "?" icon button in the header (next to Settings, not a new top-level tab) opens a Help overlay with
a sidebar of sections — one per feature area (Dashboard, Schedule, Students, Instructors, Certificates,
POS, Reports, Settings) — mirroring the sidebar+content layout `SettingsPanel.tsx` already uses. It's
an overlay rather than a tab/page swap, so opening it never disturbs whatever tab the user was already
on. Content is plain JSX per section, written to be kept in sync by hand whenever the corresponding
panel changes, instead of a separate help document that would drift out of date.

### About section in Settings
Settings has a new "About" nav item showing the installed app version (`app.getVersion()`, sourced
from `package.json` at build time) and the SQLite database file's on-disk location — useful for
troubleshooting/manual backups without digging through OS-specific app-data folders. Served via a new
`appInfo:get` IPC handler rather than a sync preload constant, to stay consistent with every other
entry on the `Api` interface being an async `ipcRenderer.invoke` call.

### Intro lesson type (free trial for prospects)
Scheduling a free introductory lesson no longer requires creating a full `Student` profile first.
A new `Lesson.type` value, `"intro"`, needs only a prospect's name (and optionally a phone number for
follow-up), stored as plain columns directly on the `Lesson` row — no `Student` record is created,
mirroring how `PosSale.studentName` is already a plain-text snapshot with no foreign key. If the
prospect signs up afterward, front desk staff just add them as a normal student the usual way; there's
no "conversion" step by design. The Schedule form's type dropdown now has a third "Intro" option that
swaps the student picker for a prospect-name + phone input, and the schedule table / Dashboard's
Today's Schedule both show a distinct icon (`UserPlus`) alongside the prospect's name. Intro lessons
are deliberately one-off only — the "Repeats weekly" recurring option is hidden for them, and
`RecurringSeriesInput.type` was narrowed to a new `RecurringLessonType` (private/group only) so the
renderer can't even construct a recurring intro series at the type level, no runtime guard needed.

### Membership button visibility + shared payment method dropdown
The Students panel's "Membership" action moved from the overflow (⋯) menu back onto the row as a
visible button next to "Details" — it's opened often enough that hiding it a click deeper wasn't
worth the tidiness. Separately, the membership payment form's freeform "Method" text input now
matches POS's cash/card/check/other dropdown, since a fast picker beats retyping the same handful of
words at the front desk. This was also the natural point to stop duplicating that 4-value set three
different ways (`POS_PAYMENT_METHODS`, and a copy-pasted `REPORT_PAYMENT_METHODS` in the Reports
feature) — it's now one shared `PAYMENT_METHODS`/`PaymentMethod` in `shared/types.ts` and one
`PAYMENT_METHOD_LABEL` map in `src/lib/membershipFormat.ts`, used by POS, Reports, and the membership
form alike. `MembershipPayment.method` stays a freeform `String?` column in the database — this is a
write-path UI/type constraint only, so old freeform historical values (and Reports' existing
normalization of unrecognized strings into "Other") are unaffected.

### Financial Reports
Added a "Reports" tab for combined revenue reporting across the two existing revenue sources —
membership dues (`MembershipPayment`) and POS sales (`PosSale`) — over a user-picked date range.
Quick presets (This Month / Last Month / This Year) set the range and generate immediately; a custom
start/end date pair covers anything else, with a plain inline validation message if the end date is
before the start date rather than silently querying an empty/nonsensical range. The report itself is
summary totals only, not an itemized transaction list — a combined total, a count + total per source,
and a breakdown by payment method (cash/card/check/other) — matching the "simple financial report"
framing this was scoped to. Membership/POS inclusion is togglable via checkboxes (both on by default)
that recompute the combined total and payment-method breakdown entirely client-side from the
already-fetched report data, so flipping a checkbox never re-queries the database. Since
`MembershipPayment.method` is genuinely freeform text (unlike `PosSale.paymentMethod`, already
constrained to a closed set), it's normalized case-insensitively into the same four buckets for the
report, with anything unrecognized — including blank/null — falling into "Other". CSV export
(`electron/ipc/reports.ts`) mirrors the existing backup-export native-save-dialog pattern exactly
rather than a browser download link, and reflects whichever sources are currently checked, not always
both. No dependency was added for CSV generation — it's hand-rolled plain string joining, consistent
with the app's existing preference for not reaching for a library where simple text formatting will
do.

### Point of Sale (POS)
Added a POS tab for ringing up front-desk purchases (merchandise, drop-in fees, etc.) — a catalog of
items (name + price only, no inventory/stock tracking) and a simple cart-based checkout. Selecting a
student is optional by design: a sale never requires one, and even when a student is picked, the sale
only stores a plain-text snapshot of their name (`PosSale.studentName`) — deliberately not a foreign
key to `Student`, so deleting or renaming a student never touches historical sales and there's no
"this student's purchase history" query to maintain. Each line item snapshots its item's name and
price at sale time (`PosSaleItem.itemName`/`unitPriceCents`), so a later catalog rename or price edit
never changes a completed sale's total — the total itself is computed server-side from the line
items, never trusted from the client. Payment method is a closed cash/card/check/other dropdown
rather than freeform text (unlike `MembershipPayment.method`), since a repetitive front-desk checkout
benefits more from a fast dropdown than typing every time. Catalog items are archived instead of
hard-deleted once they've been sold at least once (same fallback as instructors/membership plans),
and completed sales can be deleted outright as a correction mechanism for a mis-rung sale (nothing
else references a sale by foreign key, so this is always a clean hard delete).

### Automatic backups
Settings > Backup & Restore now has an "Enable automatic backups" checkbox that reveals a native
folder picker and a Frequency select (Every hour / Every 6 hours / Daily / Weekly — defaulted to
Daily; a dropdown seemed worth the trivial extra cost over hardcoding one interval). Once a folder
is chosen, an in-process timer (`electron/autoBackup.ts`) writes a timestamped, sortable snapshot
(`kumite-auto-backup-<ISO timestamp>.db`, colons swapped for dashes so the filename is valid on
Windows too) via the same better-sqlite3 backup API the manual "Export Backup" button already used
— extracted into a shared `backupDatabaseTo` helper rather than duplicated. Runs one backup
immediately on enabling (or on every app launch if already enabled) rather than waiting a full
interval for the first proof it's working, and the Settings page shows "Last automatic backup: …"
so that proof is visible, not just assumed. Settings persist in a new singleton `AppSettings` table
(same lazy-seeded-row pattern as `BusinessHours`) — added to `clear.ts`'s wipe list too. This only
runs "while the app is running," per how it was scoped — no OS-level scheduled task when the app is
closed, and (see above) no pruning of old backups yet.

### Release and Indemnity Agreement on new students
Adding a student is now a modal ("Add Student" button opens it) instead of the old always-visible
inline row — this also folded in the full field set (rank, member since, address, notes) that
previously required a follow-up Edit, so intake happens in one place. The modal ends with the
studio's Release and Indemnity Agreement text in a scrollable box and a required checkbox
("I have read and agree...") that blocks submission until checked, same validation style as the
existing first/last-name check. Fixed a run-on in the studio's original wording — it was two
sentences joined by a comma instead of a period. Agreement is persisted as `waiverAgreedAt`, a
server-stamped timestamp (not client-supplied, and not just a boolean) set at creation time only —
shown in the Details view as "Agreed <date>" or "Not on file" for students added before this existed.

### Real certificate templates (Yellow-Brown 1st) + Certificate Type (Regular/Junior)
Replaced the placeholder PDFs for Yellow, Orange, Purple, Blue, Green, and Brown 3rd/2nd/1st with
the studio's actual certificate designs, and added matching "Junior" variants for all of those ranks
— a distinction the studio's old system had that Kumite didn't yet know about. The source PDFs
turned out to have the name/date as real removable vector text layered over the artwork (not
flattened into the image, despite looking that way), so the old "Michael Walsh, 7/29" test data
could be stripped cleanly rather than needing brand-new blank templates. `electron/certificates/ranks.ts`
now maps each rank to per-type templates, each carrying its own text placement/size/color (three
layout families in total, calibrated directly from the original PDFs' own coordinates) — replacing
the single shared `NAME_POSITION`/`DATE_POSITION` that assumed one layout fit everything.
`scripts/generate-placeholder-certificates.ts` was narrowed to only ever (re)write templates
explicitly flagged `isPlaceholder`, so it can't accidentally clobber a real design. Added a
"Certificate Type" field to the Certificates page (defaults to Regular) that filters the Rank
dropdown to whichever ranks actually have a template for that type — Black-belt ranks correctly
disappear when Junior is selected, since no junior black-belt templates exist (by design — see
Backlog). Also fixed a real cosmetic bug carried over from the studio's original design: on the
Yellow/Orange/Purple/Blue/Green templates, the printed date sat right on top of the template's own
small "Test Date" label. Moved it down into the clear band between that label and the signature
line, and made date placement support horizontal centering (`TextPlacement.centered`) so it stays
balanced regardless of how wide the formatted date string is (e.g. "May 1, 2026" vs. "September 21,
2026") rather than needing a fixed left edge.

### Student Member Since field
Students can now have a "Member since" date (optional, backfilled manually — no default), shown
next to Rank in both the Edit dialog and the read-only Details view. Seed data now sets a plausible
value for every seeded student, roughly gradated by rank so the Details view doesn't just read as
"everyone joined today."

### Membership payment history: scroll container + cross-membership visibility
The per-student membership dialog's payment history table is now capped at a fixed height
(`max-h-64`) with its own scrollbar, so years of payments no longer grow the modal indefinitely.
While addressing that, found and fixed a real gap: payments are tied to whichever `StudentMembership`
row they were recorded against, and cancelling a membership only soft-ends that row (`active: false`)
rather than deleting it — but the dialog previously only ever fetched the *current* active membership,
so a student's older payment history silently disappeared from view the moment they were cancelled
and re-enrolled (the data was still in the database, just no longer reachable in the UI). Added a
`studentMemberships:getPaymentHistory` endpoint that spans every membership a student has ever had,
each payment tagged with which plan it belongs to (new "Plan" column), and the payment history
section now renders regardless of whether the student currently has an active membership at all.

### Dashboard summary stat tiles
Added three at-a-glance tiles above the existing Dashboard cards: active student count, lessons
scheduled today, and total collected this calendar month (summed from active memberships'
payments). Came out of a wider aesthetics review — two other suggestions from that review (table
row hover tint, membership status colors) turned out to already be implemented, so no change was
needed there.

### Testing-notes fixup pass
Addressed a round of manual testing feedback: the Schedule instructor/type/student/status selects
were using Radix's `item-aligned` positioning, which opens the popup centered on whichever item is
currently selected — that's why the instructor dropdown seemed to open up/down/mid-screen
depending on who was selected. Switched the shared `Select` to `popper` positioning app-wide, so
every select now consistently drops from the trigger. Added a `Tooltip` component (didn't exist
before) and wired it into the Schedule and Students-lessons notes cells so a long truncated note
can be read on hover instead of only by clicking into edit mode. Fixed the Students delete-confirm
modal's "Delete permanently…" button overflowing the dialog (the shared button style is
`whitespace-nowrap`; let that one button wrap). Mirrored the Students Details-modal/overflow-menu
pattern onto the Instructors panel (dropped Email/Phone columns, added a read-only Details dialog,
moved Edit/Delete/Reactivate into the overflow menu). Added `flex-wrap` to the navbar so tabs flow
to a second line instead of clipping on narrow window widths. Added a "Record Payment" button
directly on each Dashboard membership row, opening that student's membership dialog (which already
shows the payment form inline) without going through the per-student overflow menu.

### Student Details view
Students panel now has a read-only "Details" modal (rank, email, phone, address, notes, family
members) separate from editing, plus an "Edit" button inside it for when a change is actually
needed. The row's remaining actions (Membership, Lessons, Edit) moved into an overflow (⋯) menu
next to Details, with Delete/Reactivate kept as its own visible button so a destructive action is
never buried in a dropdown; Email/Phone columns were dropped from the table since they're now a
click away in Details. Along the way, fixed a real bug this surfaced: `Button` wasn't wrapped in
`React.forwardRef`, so `DropdownMenuTrigger asChild` couldn't attach a ref to it, and Radix's
Popper positioned the menu off-screen — fixed by forwarding the ref.

### Balance-based membership payment status
Status (`overdue`/`due_soon`/`ok`) is now computed from a real running balance — `owed = (billing
periods elapsed since start) × price − (sum of all payments)` — instead of being inferred from a
`coversUntil` date on payments. Split payments now just work (pay half, owe half shows correctly until
the rest comes in); paying multiple periods ahead naturally produces a credit. `coversFrom`/`coversUntil`
were dropped from `MembershipPayment` entirely (schema + payment form) since they no longer drive
anything — a payment is now just amount, date paid, method, and notes. The Dashboard and per-student
membership dialog both surface the actual dollar amount owed, not just a due date and status badge.

### Search functionality
Students and Instructors panels each got a live, filter-as-you-type search box (name/email/phone/rank),
next to the existing "Show archived" checkbox. Was originally scoped as a prerequisite for bulk delete;
bulk delete was later dropped as unnecessary (deleting many students/instructors at once is rare enough
not to be worth the added risk of a wrong selection wiping out multiple records), but the search itself
stands on its own as the roster grows.

### Robust per-student lesson view
Each student row in the Students panel now has a "Lessons" button that opens their full lesson history
(past + upcoming), with per-lesson delete (including the recurring this-vs-future choice). Shipped in
[1f9400b](https://github.com/amortimer20/kumite/commit/1f9400b).

### Instructor archive gap (non-delete path)
Turned out to already be fixed — [e4c83ea](https://github.com/amortimer20/kumite/commit/e4c83ea) (five
days before this backlog entry was written) made `instructors:delete` clear upcoming lessons
unconditionally, before deciding hard-delete vs. archive-fallback, so both outcomes were already clean.
The entry was stale on arrival. Added a regression test (`electron/ipc/instructors.test.ts`) to lock in
the archive-fallback behavior specifically, since it had no coverage before.
