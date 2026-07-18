// Generates a temporary set of certificate templates (one per rank) so the
// certificate feature can be built and demoed before final designs exist.
// Not wired into the app — re-run this any time to regenerate the placeholder
// set: `node scripts/generate-placeholder-certificates.ts`.
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { RANK_TEMPLATE_FILES, NAME_POSITION, DATE_POSITION } from '../electron/certificates/ranks.ts'

const OUTPUT_DIR = path.join(import.meta.dirname, '../electron/certificates/templates')
const PAGE_WIDTH = 792
const PAGE_HEIGHT = 612

async function buildTemplate(rank: string) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const sansItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  page.drawRectangle({
    x: 24,
    y: 24,
    width: PAGE_WIDTH - 48,
    height: PAGE_HEIGHT - 48,
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 1.5,
  })

  const centerText = (text: string, y: number, font = sans, size = 14, color = rgb(0, 0, 0)) => {
    const textWidth = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (PAGE_WIDTH - textWidth) / 2, y, size, font, color })
  }

  centerText('Sample Karate Academy', 500, serif, 36)
  centerText('Certificate of Achievement', 460, sans, 16)

  page.drawText('This certifies that', { x: 150, y: 365, size: 14, font: sans })
  page.drawText('To:', { x: 150, y: NAME_POSITION.y, size: 14, font: sans })
  page.drawLine({
    start: { x: 240, y: NAME_POSITION.y - 4 },
    end: { x: 650, y: NAME_POSITION.y - 4 },
    thickness: 0.75,
    color: rgb(0.6, 0.6, 0.6),
  })

  centerText(`has achieved the rank of ${rank}`, 270, serif, 22, rgb(0.55, 0.1, 0.1))

  page.drawText('Date:', { x: 150, y: DATE_POSITION.y, size: 14, font: sans })
  page.drawLine({
    start: { x: 240, y: DATE_POSITION.y - 4 },
    end: { x: 450, y: DATE_POSITION.y - 4 },
    thickness: 0.75,
    color: rgb(0.6, 0.6, 0.6),
  })

  centerText(
    'TEMPORARY PLACEHOLDER TEMPLATE — replace with final design',
    45,
    sansItalic,
    10,
    rgb(0.6, 0.2, 0.2),
  )

  return pdfDoc.save()
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  for (const [rank, filename] of Object.entries(RANK_TEMPLATE_FILES)) {
    const bytes = await buildTemplate(rank)
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), bytes)
    console.log(`Wrote ${filename}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
