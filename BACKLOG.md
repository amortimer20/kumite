# Backlog

Feature ideas discussed but not yet implemented, roughly in the order we'd want to tackle them.

## In-app Help button
Open the user handbook (`~/Desktop/Kumite Studio Handbook.docx`, or a copy bundled with the app) via
Electron's `shell.openPath()`. Deferred until the handbook existed — it now does, so this is ready to build.

## Search functionality
Search across students/instructors (and maybe lessons). Considered a prerequisite/companion for bulk
delete.

## Bulk delete
Let the user select and delete multiple students/instructors/lessons at once. Deferred until search
exists, since search is how a user would narrow down what to bulk-act on.

## Balance-based membership payment status
Membership status (`overdue`/`due_soon`/`ok`) is currently inferred from the `coversUntil` date on
payments, which means splitting a month's payment into installments only shows correctly if staff
manually shorten each payment's date range to match the fraction paid — easy to get wrong, since the
payment form defaults `coversUntil` to a full billing period regardless of amount entered.

More robust: track a running balance instead — `owed = (billing periods elapsed since start) × price −
(sum of all payments)`. Split payments then just work (pay half, owe half), and advance payments
naturally produce a credit without needing to guess a future `coversUntil` date. Open question: whether
to keep `coversFrom`/`coversUntil` on payments as descriptive notes only, or drop them from the payment
form entirely since they'd no longer drive status.

## Instructor archive gap (non-delete path)
When an instructor is *archived* (not deleted), their upcoming one-off (non-recurring) lessons aren't
cleaned up the way the delete flow now does — only active recurring series get ended. The delete flow
already handles this correctly; the archive-only path still has the gap. Low priority since archiving
without cleanup isn't unsafe, just leaves stale-looking upcoming lessons for a departed instructor.

## Done

### Robust per-student lesson view
Each student row in the Students panel now has a "Lessons" button that opens their full lesson history
(past + upcoming), with per-lesson delete (including the recurring this-vs-future choice). Shipped in
[1f9400b](https://github.com/amortimer20/kumite/commit/1f9400b).
