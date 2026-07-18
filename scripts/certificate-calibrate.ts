// Dev-only tool for finding text placement coordinates on certificate
// templates. Not wired into the app — run directly against a template PDF.
//
// PDF coordinates are points (72/inch), origin at the BOTTOM-LEFT of the
// page, y increasing upward — the opposite of most design tools (Affinity,
// Illustrator, etc.), which use a top-left origin with y increasing downward.
//
// Usage:
//   node scripts/certificate-calibrate.ts <template.pdf> <output.pdf> \
//     [--name-x N --name-y N] [--date-x N --date-y N]
//
// Run once with no --name-x/--name-y to see just the labeled point grid and
// get a starting guess. Then re-run with candidate coordinates to see sample
// text drawn on top of that same grid, and adjust until it lands right.
import fs from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

function parseArgs(argv: string[]) {
  const [templatePath, outputPath, ...rest] = argv
  if (!templatePath || !outputPath) {
    console.error('Usage: node scripts/certificate-calibrate.ts <template.pdf> <output.pdf> [--name-x N --name-y N] [--date-x N --date-y N]')
    process.exit(1)
  }
  const flags: Record<string, number> = {}
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '')
    if (key) flags[key] = Number(rest[i + 1])
  }
  return { templatePath, outputPath, flags }
}

async function main() {
  const { templatePath, outputPath, flags } = parseArgs(process.argv.slice(2))
  const pdfDoc = await PDFDocument.load(fs.readFileSync(templatePath))
  const page = pdfDoc.getPages()[0]
  const { width, height } = page.getSize()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  console.log(`Page size: ${width} x ${height} pts`)

  const GRID_STEP = 50
  const gridColor = rgb(0.8, 0.85, 1)
  const labelColor = rgb(0.3, 0.35, 0.6)

  for (let x = 0; x <= width; x += GRID_STEP) {
    page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, thickness: 0.5, color: gridColor })
    page.drawText(String(x), { x: x + 2, y: 2, size: 7, font, color: labelColor })
  }
  for (let y = 0; y <= height; y += GRID_STEP) {
    page.drawLine({ start: { x: 0, y }, end: { x: width, y }, thickness: 0.5, color: gridColor })
    page.drawText(String(y), { x: 2, y: y + 2, size: 7, font, color: labelColor })
  }

  if (flags['name-x'] !== undefined && flags['name-y'] !== undefined) {
    page.drawText('Jane A. Doe', { x: flags['name-x'], y: flags['name-y'], size: 24, font, color: rgb(0.8, 0, 0) })
  }
  if (flags['date-x'] !== undefined && flags['date-y'] !== undefined) {
    const sampleDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    page.drawText(sampleDate, { x: flags['date-x'], y: flags['date-y'], size: 14, font, color: rgb(0.8, 0, 0) })
  }

  fs.writeFileSync(outputPath, await pdfDoc.save())
  console.log(`Wrote ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
