# Backlog

Feature ideas discussed but not yet implemented, roughly in the order we'd want to tackle them.

## In-app Help button
Open the user handbook (`~/Desktop/Kumite Studio Handbook.docx`, or a copy bundled with the app) via
Electron's `shell.openPath()`. Deferred until the handbook existed — it now does, so this is ready to build.

## Robust per-student lesson view
Show a student's scheduled lessons directly on their record (Students panel), instead of requiring the
user to hunt through the calendar to find and delete/manage a specific student's lessons. Agreed this
should land *before* search and bulk-delete, since it solves the "tedious to find a lesson" problem more
directly.

## Search functionality
Search across students/instructors (and maybe lessons). Considered a prerequisite/companion for bulk
delete.

## Bulk delete
Let the user select and delete multiple students/instructors/lessons at once. Deferred until search
exists, since search is how a user would narrow down what to bulk-act on.

## Instructor archive gap (non-delete path)
When an instructor is *archived* (not deleted), their upcoming one-off (non-recurring) lessons aren't
cleaned up the way the delete flow now does — only active recurring series get ended. The delete flow
already handles this correctly; the archive-only path still has the gap. Low priority since archiving
without cleanup isn't unsafe, just leaves stale-looking upcoming lessons for a departed instructor.
