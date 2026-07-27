# Backlog

Feature ideas discussed but not yet implemented, roughly in the order we'd want to tackle them.

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

## Done

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
