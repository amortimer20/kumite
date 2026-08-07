---
name: run-kumite
description: Build, launch, and drive the Kumite Electron desktop app (karate-app) — click through the UI, fill forms, take screenshots. Use when asked to run the app, start Kumite, take a screenshot of it, test a UI flow, or verify a change actually works in the running app.
---

Kumite is an Electron + React desktop app (see `README.md` for architecture). It
has no dev-mode driver of its own — for agent/automated use, drive it via the
Playwright REPL at `.claude/skills/run-kumite/driver.mjs`. This exists because
this session had **no macOS Screen Recording permission**, so plain
`screencapture` cannot capture the app's window; Playwright's screenshots go
over CDP into the renderer directly and need no OS permission at all.

All paths below are relative to the repo root (`karate-app/`).

## Prerequisites (macOS)

`timeout` and `tmux` aren't preinstalled on macOS. Playwright drives Electron
via its own bundled driver — no browser download needed (Electron IS the
target, not a Playwright-managed browser).

```bash
brew install coreutils tmux
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"   # for `timeout`
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --save-dev playwright
```

## Build

The driver launches a **production-style build** — no separate dev server
needed. `electron/main.ts` loads `dist/index.html` directly when
`VITE_DEV_SERVER_URL` isn't set, so this is the full app, not a stub.

```bash
rm -rf dist dist-electron
npx tsc && npx vite build
```

(Skips the project's own `npm run build`'s final `electron-builder` step —
that packages an installer/DMG, which isn't needed just to launch and drive
the app locally.)

If you want a clean, non-duplicated set of sample data first (repeated
`npm run db:seed` runs append rather than replace):

```bash
npm run db:clear -- --yes && npm run db:seed
```

## Run (agent path)

```bash
node .claude/skills/run-kumite/driver.mjs
```

Wrap in tmux for interactive use — this is the exact sequence used to verify
this skill:

```bash
tmux new-session -d -s kumite -x 200 -y 50
tmux send-keys -t kumite 'node .claude/skills/run-kumite/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t kumite -p | grep -q "driver>"; do sleep 0.2; done'
tmux send-keys -t kumite 'launch' Enter
timeout 30 bash -c 'until tmux capture-pane -t kumite -p | grep -q "launched"; do sleep 0.3; done'
tmux send-keys -t kumite 'click-text Students' Enter
sleep 1
tmux send-keys -t kumite 'ss students' Enter
tmux capture-pane -t kumite -p
```

Screenshots land in `/tmp/kumite-shots/` (override: `SCREENSHOT_DIR`). Then
actually open the PNG and look at it — a blank or crashed window is a failure
even if every command returned "OK".

### Commands

| command | what it does |
|---|---|
| `launch` | launch the already-built app (run the Build step first), wait for the window |
| `ss [name]` | screenshot → `/tmp/kumite-shots/<name>.png` |
| `click <css-sel>` | click element via `document.querySelector` + `.click()` |
| `click-text <text>` | click first `button`/`a`/`[role=button]`/`[role=tab]` whose text matches |
| `type <text>` / `press <key>` | keyboard input into whatever's focused |
| `wait <css-sel>` | wait up to 10s for an element to appear |
| `eval <js>` | run arbitrary JS in the page, print the JSON result |
| `text [css-sel]` | print `innerText` of an element (or `document.body`) |
| `windows` | list window URLs |
| `quit` | close the app, exit the driver |

For anything `click-text` can't reach (see Gotchas — Radix Select/Checkbox
aren't `button`/`role=button`), use `eval` with a scoped `querySelector`.

## Run (human path)

```bash
npm run dev
```

Opens a real window via `vite-plugin-electron` (Vite dev server + Electron,
hot-reloading) — Ctrl-C to quit. Fine for a human at the keyboard; useless for
an agent since nothing can click into it without a driver.

## Gotchas

- **Two buttons can share the exact same text.** The Students page's
  "Add Student" button (opens the dialog) and the dialog's own submit button
  are both labeled "Add Student" — `click-text` matches the *first* one in DOM
  order, which is the page's trigger, not the dialog's submit button. This
  silently reopens/resets the dialog instead of submitting it, and looks like
  nothing happened. **Whenever a dialog is open, scope the query to it:**
  `document.querySelector('[role=dialog] ...')`, not a bare document-wide
  selector or `click-text`.

- **`el.click() || "fallback"` always logs "fallback."** `Element.click()`
  returns `undefined`, which is falsy — `foo?.click() || "NOT_FOUND"` prints
  "NOT_FOUND" whether or not the click happened. Check existence explicitly
  (`if (!el) return "NOT_FOUND"; el.click(); return "OK"`) rather than
  short-circuiting off the return value of `.click()`.

- **Radix UI primitives aren't plain `button`/`input`.** The shadcn/Radix
  Checkbox is `[role=checkbox]` (a `<button>`, but `click-text` won't find it
  by its label text — the text is a sibling `<label>`, not the button's own
  textContent). Radix Select's dropdown items are `[role=option]`, not
  `[role=button]`, so `click-text` (which only matches
  `button, a, [role=button], [role=tab]`) can't reach them either — use
  `eval` with `document.querySelectorAll('[role=option]')` instead.

- **Reading a just-toggled Radix control's `data-state` synchronously is
  unreliable.** React's state update isn't necessarily flushed yet when the
  `eval` call returns. Screenshot and look, rather than trust an immediate
  attribute read.

- **The app enforces a single-instance lock** (`app.requestSingleInstanceLock`
  in `electron/main.ts`). If a previous driver run didn't `quit` cleanly,
  launching again may just focus the old window instead of giving Playwright
  a fresh, controllable instance — `quit` explicitly when done, and
  `pkill -f "Electron.app/Contents/MacOS/Electron \."` if a launch seems to
  attach to a stale process.

- **`npm run db:seed` doesn't clear first** — running it more than once
  duplicates every seeded student/instructor. Not a driver bug, just a project
  quirk worth knowing before you go looking for a student by name and find two.

## Troubleshooting

- **`ERR_MODULE_NOT_FOUND` for 'playwright'`:** the driver (or any throwaway
  script using it) must live inside the repo so Node's ESM resolver finds
  `node_modules` — a script in `/tmp` won't resolve it.
- **Launch hangs / no "launched" in the pane:** confirm `dist/index.html` and
  `dist-electron/main.js` exist (re-run the Build step) — the driver doesn't
  build for you beyond what you ran manually first.
- **`tmux: command not found` / `timeout: command not found`:** see
  Prerequisites — neither ships with macOS.
