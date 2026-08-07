// REPL driver for Kumite (the karate-app Electron desktop app).
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
//
// Drives the app via Playwright's Electron support, connected over CDP —
// this works with zero OS permissions (no macOS Screen Recording access
// needed for `ss`, unlike a real screencapture), which is why this exists
// instead of just taking a screenshot of the display.
import { _electron as electron } from 'playwright'
import * as readline from 'node:readline'
import * as fs from 'node:fs'
import * as path from 'node:path'

const APP_DIR = path.resolve(import.meta.dirname, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/kumite-shots'
fs.mkdirSync(SHOT_DIR, { recursive: true })

let app = null
let page = null

const COMMANDS = {
  // No executablePath override needed — Playwright finds node_modules/electron's
  // own binary. Requires dist/ and dist-electron/ to already be built (see
  // SKILL.md's Build section); main.ts loads dist/index.html directly when
  // VITE_DEV_SERVER_URL isn't set, so no separate dev server needs to be running.
  async launch() {
    if (app) return console.log('already launched')
    app = await electron.launch({
      args: ['.'],
      cwd: APP_DIR,
      env: { ...process.env, NODE_ENV: 'production' },
      timeout: 30_000,
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // No reliable "app ready" signal beyond the DOM having loaded — the
    // Dashboard tab (the default view) renders once the first round of IPC
    // calls resolve, which is fast against local SQLite. A `wait` for a
    // known selector (see below) is more robust than a blind sleep if you
    // need to be sure data has loaded.
    console.log('launched. title:', await page.title(), 'url:', page.url())
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first')
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png')
    await page.screenshot({ path: f })
    console.log('screenshot:', f)
  },

  // DOM click rather than locator.click() — simpler to target by text this
  // way, and there's no BrowserView layering in this app to worry about.
  async click(sel) {
    if (!page) return console.log('ERROR: launch first')
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK'
    }, sel)
    console.log('click', sel, '→', r)
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first')
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')]
      const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t))
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK: ' + el.tagName
    }, text)
    console.log('click-text', JSON.stringify(text), '→', r)
  },

  async type(text) {
    if (page) await page.keyboard.type(text, { delay: 30 })
  },
  async press(key) {
    if (page) await page.keyboard.press(key)
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first')
    try {
      await page.waitForSelector(sel, { timeout: 10_000 })
      console.log('found:', sel)
    } catch {
      console.log('TIMEOUT:', sel)
    }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first')
    try {
      console.log(JSON.stringify(await page.evaluate(expr)))
    } catch (e) {
      console.log('ERROR:', e.message)
    }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first')
    console.log(await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null))
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first')
    for (const w of app.windows()) console.log(' ', w.url())
  },

  async quit() {
    if (app) await app.close().catch(() => {})
    app = null
    page = null
  },
  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '))
  },
}

// Stop Electron from stealing stdin — use the raw fd.
const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') })
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' })

rl.on('line', async (line) => {
  const [cmd, ...rest] = line.trim().split(/\s+/)
  if (!cmd) return rl.prompt()
  const fn = COMMANDS[cmd]
  if (!fn) {
    console.log('unknown:', cmd, '— try: help')
    return rl.prompt()
  }
  try {
    await fn(rest.join(' '))
  } catch (e) {
    console.log('ERROR:', e.message)
  }
  if (cmd === 'quit') {
    rl.close()
    process.exit(0)
  }
  rl.prompt()
})
rl.on('close', async () => {
  await COMMANDS.quit()
  process.exit(0)
})

console.log('Kumite driver — "help" for commands, "launch" to start')
rl.prompt()
