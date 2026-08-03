# Backlog

Feature ideas discussed but not yet implemented, roughly in the order we'd want to tackle them.

## No retention policy on automatic backups
The new automatic-backup feature (see Done below) never deletes old backups — at the hourly setting
especially, these will accumulate indefinitely and could fill a drive over months of use. Not built
now since it wasn't asked for, but worth a "keep last N" or "delete older than X days" cleanup pass
in `electron/autoBackup.ts`'s `runAutoBackupNow` before this ships to a studio actually running it
hourly for a long time.

## Black belt certificate templates (1st-10th degree) still placeholders
Yellow through Brown 1st now have the studio's real certificate designs (see Done below), but no
Black-belt templates exist yet — `scripts/generate-placeholder-certificates.ts` still generates
those 10. Swap them in via `electron/certificates/ranks.ts`'s `RANK_TEMPLATES` map once real designs
exist, following the same pattern as the other ranks (drop the file in, add `namePlacement`/
`datePlacement` coordinates, remove `isPlaceholder`). Note the studio's convention is no "junior"
Black-belt certificate at all — juniors aren't graded to black belt — so these only ever need a
`regular` entry.

## Verify the Windows installer end-to-end
No in-app/over-the-air auto-updates — updates will just be a newer installer the studio re-runs
each release. The NSIS config in `electron-builder.json5` is already set up for this
(`perMachine: false` installs per-user to AppData with no admin prompt, `oneClick: false` shows an
install wizard with a progress screen, and Start Menu/Desktop shortcuts are on by default) — running
a newer installer over an existing install replaces it in place with no extra code needed. Still
untested: do a real Windows build/install/upgrade pass to confirm it works as expected, and decide
whether code-signing is worth it later (unsigned installs currently show a Windows "Unknown
Publisher" SmartScreen warning — not a blocker, just rougher first impression).

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
expressible instead of needing another carry-forward field each time. Worth considering before the
non-traditional-fees work below, since that's likely to need proration.

## Non-traditional membership fees (needs clarification)
The last feature-shaped gap before the app is considered feature-complete for its first iteration.
Blocked on the studio owner working out the actual business rules — not yet a design, just the open
questions to resolve before one can be written:
- **Paying for one or more extra lessons.** How does this affect the membership's due date? Does it
  make the existing "included private lessons per plan" / bonus-lesson mechanism redundant, or do the
  two coexist? Does an extra-lesson purchase carry over into the next billing month if unused, or does
  it expire at the period boundary like the plan's included lessons currently do?
- **Pro-rating.** What does "pro rate" mean here in practice — a mid-cycle plan change/upgrade
  prorated to the remaining days in the period, a prorated first payment for someone joining mid-month,
  or something else the studio does today that isn't represented in the app at all yet?
- **Pay-as-you-go membership.** Does the studio actually offer this as a membership type (as opposed
  to just POS drop-in sales, which already exist)? If so, it likely doesn't fit the current
  `MembershipPlan` model's assumption of a fixed recurring price/billing frequency, and touches due-date
  and balance-owed logic (`electron/ipc/memberships.ts`) that assumes a regular billing cycle.

## Black belt certificate templates — waiting on real files
Already tracked above ("Black belt certificate templates (1st-10th degree) still placeholders") —
noting here that this is specifically blocked on the studio owner sourcing/providing the actual
template files, not on any further design work; the swap-in mechanism described above is already
built and ready.

## Done

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
