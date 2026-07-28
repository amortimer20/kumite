# Backlog

Feature ideas discussed but not yet implemented, roughly in the order we'd want to tackle them.

## Replace placeholder certificate templates
The 9 rank certificate PDFs in `electron/certificates/templates/` (`yellow.pdf` through `black.pdf`,
no `white.pdf` by design) are auto-generated placeholders from `scripts/generate-placeholder-certificates.ts`,
not the studio's real certificate design. Swap in the official templates once they exist — same
filenames/rank mapping (`electron/certificates/ranks.ts`) should drop in without other code changes,
though text placement may need re-checking with `scripts/certificate-calibrate.ts`.

## Auto-updates
There's currently no update mechanism at all — no `electron-updater`, no publish/feed config
(`electron-builder.json5` has `publish: null` on purpose, to keep CI from trying to auto-detect a
GitHub publish target). Right now, updating means manually rebuilding and reinstalling. Adding real
auto-updates would mean picking a distribution channel (e.g. GitHub Releases), installing
`electron-updater`, wiring up its events in `electron/main.ts`, and deciding on code-signing —
enough scope to deserve its own session rather than being bundled into a bug-fix pass.

## Done

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
