# Kumite

Studio management for Tracy's Kenpo Karate — a desktop app for students, scheduling, memberships,
point of sale, and rank certificates.

Single-tenant and offline by design: it runs on the studio's own machine against a local SQLite file.
There is no server, no account system, and no network dependency.

- **Stack**: Electron + React 18 + TypeScript, Vite, Prisma 7 + SQLite (via the `better-sqlite3`
  driver adapter)
- **Developed on** macOS, **shipped to** Windows

## Getting started

Requires Node 26 (the version CI builds with — see `.github/workflows/build-windows.yml`).

```bash
npm install
```

`postinstall` handles the two steps that are easy to miss: it generates the Prisma client into
`generated/` (gitignored, so it must be generated locally) and rebuilds `better-sqlite3` against
Electron's ABI.

Then create `.env` from the example and set up the development database:

```bash
cp .env.example .env
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Seeding is optional but recommended — it gives you students, instructors, lessons, membership plans,
and a POS catalog to click around in. Now run the app:

```bash
npm run dev
```

That single command starts the Vite dev server *and* launches Electron against it, with hot reload for
the renderer and an automatic restart when you change main-process code.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + Electron, with hot reload |
| `npm run build` | Typecheck, bundle, and package an installer into `release/<version>/` |
| `npm run lint` | ESLint, with `--max-warnings 0` |
| `npm test` | Vitest once (see the native-module note below) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:migrate` | Create and apply a migration from schema changes |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Browse the dev database in Prisma Studio |
| `npm run db:seed` | Load sample data |
| `npm run db:clear` | Wipe all data in `prisma/dev.db` (prompts; `-- --yes` skips it) |
| `npm run certificate:calibrate` | Overlay a coordinate grid on a template PDF, for tuning certificate text placement — takes `<template.pdf> <output.pdf>`, see the usage comment at the top of the script |

### The `better-sqlite3` rebuild dance

`better-sqlite3` is a native module, and Node and Electron use incompatible ABIs. The app runs under
Electron; the tests run under plain Node. So `npm test` rebuilds it for Node, runs Vitest, and rebuilds
it for Electron again afterwards.

The practical consequence: **run tests with `npm test`, not bare `npx vitest`.** Running Vitest directly
uses whichever build is currently in place, and if that's the Electron one, the database-backed suites
fail with a `NODE_MODULE_VERSION` mismatch. If you ever get that error, `npm test` puts things right.

## Where the data lives

| | Database file |
| --- | --- |
| Development | `prisma/dev.db` (from `DATABASE_URL` in `.env`) |
| Packaged app | `karate-app.db` in the OS per-user app-data folder |

These are completely separate, so seeding or clearing the dev database can't touch a real
installation. The packaged path is shown in the app under **Settings > About**; on Windows it's
`%APPDATA%\karate-app\`, on macOS `~/Library/Application Support/karate-app/`.

Migrations are applied at startup by `electron/migrate.ts`, not by the Prisma CLI — a packaged app has
no CLI available. Each migration runs in a transaction, so an interrupted upgrade rolls back rather
than leaving a half-migrated database.

## Layout

```
electron/          Main process
  ipc/             One module per feature area; each registers ipcMain handlers
  certificates/    PDF generation and the rank template map
  db.ts            Prisma client, restore-on-startup, migration trigger
  migrate.ts       Applies prisma/migrations at startup
  preload.ts       contextBridge surface — the only thing the renderer can reach
src/               Renderer (React)
  components/      One panel per tab, plus dialogs
  lib/             Shared formatting and date helpers
shared/types.ts    Types and constants used by both sides, including the Api interface
prisma/            Schema, migrations, seed and clear scripts
scripts/           One-off developer tools
build/             Source icon that electron-builder converts per platform
```

The renderer never touches the database. It calls `window.api`, typed by the `Api` interface in
`shared/types.ts`, which `electron/preload.ts` implements as named IPC channels — there is deliberately
no generic passthrough.

## Tests

Vitest, in a Node environment. Coverage is concentrated on the logic where a mistake is expensive and
invisible: membership billing math, recurring-series date generation, backup retention and restore
validation, and the student archive/delete path.

```bash
npm test
```

Pure logic lives in files like `electron/membershipLogic.ts` with no Prisma or Electron imports, so it
can be tested directly. Handlers that need a database use `electron/testUtils/testDb.ts`, which builds
a temporary SQLite file by running the real migration history against it.

## Building an installer

```bash
npm run build
```

Output goes to `release/<version>/`. Building on macOS produces a `.dmg`; the **Windows** installer is
built by the `Build Windows Installer` GitHub Actions workflow, which is manual (`workflow_dispatch`)
and runs on a real Windows runner so the native module is compiled for Windows rather than
cross-compiled.

Builds are unsigned, so Windows shows a SmartScreen "Unknown Publisher" warning on first run, and
testers need **More info → Run anyway**. Worth saying up front when handing over a build.

Updating is just running a newer installer over the top; it installs per-user with no admin prompt and
leaves the database alone. There is no auto-updater.

## Notable conventions

- **Money is integer cents** everywhere. `dollarsToCents` / `formatCents` in `src/lib/membershipFormat.ts`
  are the only conversion points.
- **Dates** cross IPC as ISO strings; `src/lib/isoDate.ts` is the single source for local-calendar-date
  handling, which matters because `new Date("yyyy-mm-dd")` parses as UTC and can land a day off.
- **Records with history are archived, not deleted.** Students, instructors, membership plans, and POS
  items all fall back to setting `active: false` rather than destroying rows a past lesson or sale
  refers to.
- **Historical rows snapshot what they need.** A POS line item stores the item's name and price at sale
  time, and a membership stores the price and cadence it was signed up at, so later edits can't rewrite
  the past.
- **No runtime schema validation** (no Zod). The renderer is trusted; handlers use narrow
  `assertValid*` guards where the invariant matters.
- **The in-app Help panel is the user documentation.** `src/components/HelpPanel.tsx` has a section per
  feature area, and it's meant to be updated in the same commit as any feature change.
- `BACKLOG.md` tracks planned work and known gaps, with a `## Done` section recording why things were
  built the way they were.
