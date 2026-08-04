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

## Verify the Windows installer end-to-end
No in-app/over-the-air auto-updates — updates will just be a newer installer the studio re-runs
each release. The NSIS config in `electron-builder.json5` is already set up for this
(`perMachine: false` installs per-user to AppData with no admin prompt, `oneClick: false` shows an
install wizard with a progress screen, and Start Menu/Desktop shortcuts are on by default) — running
a newer installer over an existing install replaces it in place with no extra code needed. Still
untested: do a real Windows build/install/upgrade pass to confirm it works as expected, and decide
whether code-signing is worth it later (unsigned installs currently show a Windows "Unknown
Publisher" SmartScreen warning — not a blocker, just rougher first impression).

## Watch item: one unexplained 30s startup hang after rapid kill/relaunch cycling
Seen once while verifying the packaged mac build, right after the single-instance lock was added. The
app started, printed Chromium singleton errors (`write() failed: Broken pipe`, `Failed to extract pid
from path: .../SingletonLock`), took ownership of the lock, and then never ran the startup migrations
at all — no window, no database, process alive and idle indefinitely. It happened after several
`kill -9`/relaunch cycles in quick succession, so the previous instance's `SingletonSocket` was
probably being torn down mid-negotiation.
**Not reproducible**: a clean start migrates in ~1s, and a deliberate `kill -9` followed by an
immediate relaunch takes the lock cleanly with no errors. Left here because it involved new code
(`app.requestSingleInstanceLock()` in `electron/main.ts`) and the symptom — an app that is running but
does nothing, forever — is the worst possible one to hit at a studio. If it recurs, the thing to check
is whether `app.whenReady()` ever resolves; a `--user-data-dir` conflict or a stale `SingletonSocket`
in `%APPDATA%`/Application Support is the likely culprit, and deleting the three Singleton* entries
clears it. Related: `reportFatalError` uses the blocking modal `dialog.showErrorBox` and is wired to
`process.on('uncaughtException')`, so an early crash shows a dialog and waits rather than exiting —
correct when someone is at the keyboard, wedged when nobody is.

## No way to raise the price for students already on a plan
Plan price/cadence edits now apply to new sign-ups only — existing memberships bill at the price they
were signed up at (see "Membership billing no longer re-bills the past" in Done). That was the
deliberate choice, because the alternative was the bug it replaced: editing a plan rewrote every past
period for everyone on it. The gap it leaves is that raising prices for existing members means opening
each student's Membership and setting a custom price by hand, which doesn't scale past a handful.
Worth adding a prompt on save — "apply to the N students on this plan from today forward?" — which
would re-snapshot those memberships and bank their current term into `priorChargesCents`, exactly the
mechanism a cadence-changing plan switch already uses. Past periods must keep the old price either
way.

## Membership billing has no per-period charge ledger
`amountOwedCents` is derived (`priorChargesCents` + periods elapsed x snapshotted price - total paid)
rather than read from a list of what was actually charged when. That's why the snapshot and
`priorChargesCents` fields exist at all: without them, anything that changed a price or an anchor
retroactively rewrote history. It works and is now correct for the cases the app supports, but a real
ledger (one row per period charged, with its own price) would make partial-period proration,
mid-period plan changes, and "show me exactly why this student owes this" straightforwardly
expressible instead of needing another carry-forward field each time. Not a blocker for the
non-traditional-fees work below, as first thought — that design's proration and paid-extra-lesson
charges both fit `priorChargesCents` as it stands. This stays a "worth doing eventually" item, and the
case for it is readability of the balance rather than any capability the app currently lacks.

## Non-traditional membership fees — paid extra lessons and proration
The last feature-shaped gap before the app is feature-complete for its first iteration. The business
rules are now settled (answers from the studio owner below), so this is a design ready to build rather
than an open question.

**The rules, as answered.** Reference membership is one lesson per week, billed monthly.
- Membership dues are still due on the normal billing date, regardless of any paid extra lessons.
- Extra lessons do **not** carry over into the next month — use it or lose it.
- There are **no** prepaid memberships. "Paying weekly" just means a weekly-billed membership, which
  the app already supports, so there is nothing to build for this.
- **Pro rate**: a student can be charged for a portion of a month, so that from then on they are
  billed at the start of each month like everyone else.
- Students are normally billed on the **1st**, and that should be the default when setting up a
  membership.

**What already works.** Use-it-or-lose-it is how the app behaves today, by design rather than by
accident: `scheduledLessons` is counted only within `[periodStart, periodEnd)`
(`electron/ipc/memberships.ts`), usage adjustments are filtered to the same window
(`electron/membershipLogic.ts` `computeUsage`), and remaining lessons are recomputed from the plan each
period with no stored balance that could roll forward. So the carry-over question needs no work at all.

**What's actually missing.** A *paid* extra lesson has no home. `MembershipUsageAdjustment` is only
`delta` + `reason` — no amount, no payment method, and it never reaches Reports. So today staff have to
pick one half-measure: ring it up as a POS sale (money is recorded, but the lesson then eats into the
student's included allowance) or add a bonus adjustment (allowance is right, but the income is invisible
to Reports entirely). The second silently under-reports revenue, which is the worse of the two.

**Design — paid extra lessons.** One dialog, one atomic operation, three legs, all reusing mechanisms
that already exist:

| Leg | Mechanism | Why it's needed |
| --- | --- | --- |
| Charge | add to `priorChargesCents` | keeps owed = (ever charged - ever paid) correct |
| Payment | a `MembershipPayment` row | money lands in the existing membership-dues revenue line |
| Allowance | a positive `MembershipUsageAdjustment` delta | +N lessons, already period-scoped so it expires correctly |

The charge leg is **not optional**. A payment with no matching charge is read as prepayment toward
dues and silently reduces what the student owes next month — the same phantom-credit failure mode as
the plan-switch bug fixed in "Membership billing no longer re-bills the past" below. All three legs
must be written in one transaction so staff can't half-complete it.

Routing the payment through `MembershipPayment` also answers where the money shows up: it flows into
the membership-dues line Reports already has, so no third top-level revenue source is needed and the
existing include-toggles and CSV export stay as they are.

Price is typed in per transaction — the studio has no fixed rate, and it flexes by student and by how
many lessons are being bought. This matches the precedent already set by
`StudentMembership.priceOverrideCents`, so it isn't a new pricing philosophy. Two guardrails:
- Validate greater than zero, per the price-validation fix already in Done. A free-typed amount with
  no reference point on screen is exactly where a $5-for-$50 typo hides unnoticed.
- Pre-fill with the last extra-lesson amount charged to that student. No schema cost (it's already in
  the data), it removes the retyping, and it gives staff a sanity reference. Deliberately **not** a
  plan-level default rate — that's speculative until a standard rate actually emerges, and the
  pre-fill covers the ergonomics without committing to a rule.

**Design — proration.** A suggested value the user can override.
- Suggest `round(monthlyPrice x daysRemaining / daysInMonth)`, pre-filled and editable. Chosen over
  prorating by scheduled lesson count because it's explainable to a parent at the desk and doesn't
  depend on the schedule already existing at signup.
- Set `startDate` to the **1st of the next month** and put the agreed stub in `priorChargesCents`. The
  balance math then needs no changes at all: owed = stub + (periods since the 1st x price) - paid.
- Moving the anchor to the 1st is the whole point — leaving it on the join date bills the student on
  the 17th in perpetuity, which is precisely what proration is meant to avoid.
- Because the amount is overridable it has to be *stored* rather than re-derived from dates, which is
  already what `priorChargesCents` does, so supporting the override costs nothing.
- Offer proration only for monthly memberships. Weekly and biweekly periods are short enough that a
  stub isn't worth the complexity, and the studio's answer only describes the monthly case.

**Prerequisite, folded in here.** Default the assign-membership start date to the 1st.
`EMPTY_ASSIGN_FORM` in `src/components/StudentMembershipDialog.tsx` currently evaluates `todayIso()`
once at module load, so the default is both stale on a front-desk machine left running for days and
wrong for any mid-month signup. Proration depends on this, so it isn't tracked separately.

**Scope notes.** This needs no per-period charge ledger (see the entry above) — a one-off stub and a
one-off extra-lesson charge both fit `priorChargesCents` as it stands. The billing math in
`electron/membershipLogic.ts` has good unit coverage already, so the proration calculation and the
three-leg charge should get tests there. `src/components/HelpPanel.tsx` will need its Students and
Settings sections updated to describe both flows.

## From the pre-beta code review (not yet addressed)
The data-loss/startup blockers and the money-correctness findings from that review are fixed (see
Done). These are the rest, kept in one place so they don't get lost. Roughly in the order worth
tackling.

### Most api.* failures are still silent
There is no `unhandledrejection` handler, and most mutating `api.*` calls have no `try/catch`. The
established convention is `catch (err) { toast.error(getErrorMessage(err)) }` and every `onSubmit`
follows it, but most non-submit handlers don't — so a failed IPC call is an unhandled rejection with no
user feedback, i.e. the click appears to do nothing. `src/hooks/useLessonDelete.ts` is the only file
that calls `api.*` without even importing `getErrorMessage`. Worth doing in the same pass:
`SettingsPanel.tsx`'s business-hours handler updates state optimistically then awaits with no catch, so
a failed write leaves the UI showing a value the database never took. Also every *initial* fetch is
uncaught, which is worse than it sounds — `DashboardPanel.tsx` clears `loading` in `.finally`, so if its
three parallel calls reject the dashboard confidently renders "0 Active students", "$0.00 Collected this
month" and "All memberships are up to date." A generic "couldn't load" state would be a big improvement.
(The error boundary half of this entry is done — see Done.)

### Automatic backups fail invisibly, and a partial write looks like a valid backup
Two gaps beyond the retention item above, both in `electron/autoBackup.ts`. First, every failure is
swallowed to `console.error` and `lastAutoBackupAt` is only written on success, so if the target folder
is renamed, deleted, or is a network/OneDrive path that stops resolving, backups silently stop forever
while Settings keeps showing a stale date — the user's mental model stays "backups are on". This
compounds everything else here, since backups are the only recovery path. Second, `backupDatabaseTo`
writes straight to the final timestamped filename, so a write interrupted by a pulled USB stick or a
quit leaves a correctly-named file that is not a usable backup. Writing to `<name>.partial` and
renaming on success, plus a `PRAGMA integrity_check` on the result, would make a bad backup impossible
to mistake for a good one. (Restore now validates the file it's given, so a bad backup is at least
caught at restore time rather than bricking the app — but it's still a backup the studio thought they
had and don't.)

### The installer still ships bundled libraries a second time
Partly addressed: moving the build-only packages to `devDependencies` and cleaning `dist-electron`
between builds took `app.asar` from 243 MB to 81 MB and the DMG from 160 MB to 128 MB. What remains is
that `date-fns`, `lucide-react`, `@radix-ui`, `react-day-picker` and `pdf-lib` are each shipped as raw
source *as well as* being bundled by Vite into `dist/assets` (renderer) or `main.js` (main) — around
11,500 files that are never loaded, because `vite.config.ts` marks only `better-sqlite3` and
`@prisma/adapter-better-sqlite3` as external. They can't simply move to `devDependencies` without
lying about what the app depends on, so the honest fix is an explicit `files` allowlist in
`electron-builder.json5` that packages only those two externals and their transitive deps. That needs
care (better-sqlite3 pulls in `bindings`, `prebuild-install` and friends) and a verified launch
afterwards, which is why it wasn't bundled into the quick pass. Note the DMG will never drop far below
~100 MB regardless: Electron's own framework is ~96 MB of it.

### Electron is 13 major versions behind and out of support
`electron@30.5.1` against 43.x current. Electron supports roughly the latest three majors, so 30 is
well past EOL and carries unpatched Chromium and Node CVEs. Mitigating factor: the app loads only
local files, renders no remote content, and has no external links, so there's no obvious delivery
path — this is why it's here and not in the blockers. Still worth scheduling, and the upgrade will
want a `better-sqlite3` rebuild and a check of the `sandbox`/preload behaviour described below.

### User data lives in a folder named after the package, not the product
`app.getName()` resolves to the package `name`, so the database lands in `%APPDATA%\karate-app`
(`~/Library/Application Support/karate-app` on macOS) rather than `Kumite` — and that path is shown to
users in Settings > About, so the mismatch is visible. Setting `productName` in `package.json` would
fix the name, but it also changes where the database lives, so it needs a migrate-the-existing-file
story rather than a bare rename. Best done before the studio has data worth moving, or not at all.
(The `author`/`description` metadata and the 800x600 default window that used to be in this entry are
both fixed.)

### Stale-response races in three dialogs
`SchedulePanel.tsx` guards against this with `lessonsRequestIdRef`; three places that need the same
guard don't have it. Worst is `StudentMembershipDialog.tsx`, keyed on `student?.id` with no guard: open
student A (slow query, long payment history), close, open student B, and A's membership, amount owed
and payment history can land last and render under B's name — and because `membership.id` comes from
that stale object, a payment recorded from that screen posts to A's membership. Same shape in
`StudentsPanel.tsx`'s per-student Lessons dialog (A's lessons under B's title, with Delete acting on
A's) and `ReportsPanel.tsx` (click "This Year" then "This Month"; whichever resolves last wins).
Relatedly, the membership dialog's effect resets its forms but never clears `membership` /
`paymentHistory`, so a failed fetch for the newly-opened student shows the previous student's figures
under the new name.

### Highest-risk untested logic
Coverage is good where it exists (membership billing math, recurring-series dates, the student
archive/delete path, restore validation) but concentrated there. Ranked by likelihood x cost:
`electron/ipc/pos.ts` has zero tests despite being all money, and is already refactored into exported
functions so tests are nearly free — assert that a sale keeps its snapshotted price after the catalog
is repriced, that an unknown `itemId` throws, that `assertValidSaleInput` rejects empty carts and
non-integer quantities, and that `deletePosItem` archives on FK violation. `computeReport` in
`reports.ts` has zero tests and classic date-boundary risk — assert a payment at 23:59 on `endDate` is
included and one the next day isn't, and that `buildCsv`'s combined total honours the
`includeMembership`/`includePos` flags, which is the one place CSV output can silently disagree with
the screen. Then `assertNoOverlap` in `lessons.ts` (`excludeLessonId` self-conflict, cancelled lessons
not blocking, back-to-back lessons where `end === next start`) and the `lessons:update` merge
semantics where an absent key means "keep" and an explicit `null` means "clear".
`reconfigureAutoBackup` is pure `setInterval` logic that `vi.useFakeTimers()` covers trivially, and
silent backup loss is this app's worst failure mode. Cheapest real win: extract `buildScheduleRows`
from `SchedulePanel.tsx` into `src/lib/` and test the gap computation (cancelled lesson doesn't consume
its slot, lesson running past closing time, overlapping lessons) — it needs no renderer test infra and
runs under the existing node-environment vitest config.

### Recurring series edge cases
Three separate small bugs in `electron/ipc/recurringSeries.ts`. `generatedUntil` is advanced
unconditionally, including on the path that *skips* an occurrence because of a conflict, so a week
skipped for a double-booking is never retried on any later startup — that lesson silently never
exists. A series whose first occurrence is beyond the 12-week rolling horizon generates no dates, so
`combineDateAndTime(undefined, ...)` produces an Invalid Date and the user gets a cryptic Prisma
validation error instead of "you can't schedule a series that far out". And because occurrences are
generated from `startDate` forward, a back-dated series inserts past `scheduled` lessons that count
against the current period's included private lessons, silently spending a paid allowance.

### Smaller correctness and consistency items
Grouped because none is worth its own entry. `EMPTY_ASSIGN_FORM` in `StudentMembershipDialog.tsx`
evaluates `todayIso()` once at module load, so on a front-desk machine left running for days the
default membership start date — the billing anchor — is stale; `StudentsPanel` already recomputes
this at open time. Money inputs accept values above the 32-bit `Int` columns, so a fat-fingered price
surfaces a raw Prisma overflow message in a toast. Server-side validation is absent from half the IPC
handlers: `lessons.ts`, `pos.ts` and `memberships.ts` have `assertValid*` guards, while
`students.ts`, `instructors.ts`, `familyMembers.ts`, `businessHours.ts` and `settings.ts` have none —
`students:create` accepts an empty `firstName` and `businessHours:update` accepts a close time before
the open time, which then makes the Schedule availability grid silently render nothing for that day.
`normalizeMethod` in `reports.ts` hardcodes `'cash'|'card'|'check'` instead of deriving from the
`PAYMENT_METHODS` constant it already imports, so a fifth method would zero-fill correctly but never
receive rows. `SchedulePanel.tsx` and `CertificatesPanel.tsx` still define local `todayIsoDate()` /
`dateToIso()` helpers byte-identical to the ones in `src/lib/isoDate.ts` — whose own header comment
points back at SchedulePanel as the convention it was extracted from, so the extraction happened but
the call sites were never migrated. And `HelpPanel.tsx` claims a deleted student's "past lessons and
certificates stay intact", but there is no certificate persistence anywhere — certificates are
generated to a temp file and never recorded — so "and certificates" should go. (The Vite template
leftovers that used to be listed here — the dead `main-process-message`, the one commented-out line,
the default `/vite.svg` favicon and the two unused `public/electron-vite*.svg` files — are all
removed.)

## Done

### POS cart no longer quotes a price the sale won't use
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
