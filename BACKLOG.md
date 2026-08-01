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

## Done

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
