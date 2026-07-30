// Generates placeholder certificate templates for any rank/type that doesn't
// have a real design yet (currently just the Black-belt degrees). Safe to
// re-run any time: only entries marked `isPlaceholder` in RANK_TEMPLATES are
// (re)written, so this can never clobber a real template.
// `node scripts/generate-placeholder-certificates.ts`.
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { RANK_TEMPLATES } from '../electron/certificates/ranks.ts'

const OUTPUT_DIR = path.join(import.meta.dirname, '../electron/certificates/templates')
const PAGE_WIDTH = 792
const PAGE_HEIGHT = 612

async function buildTemplate(rank: string, nameY: number, dateY: number) {
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
  page.drawText('To:', { x: 150, y: nameY, size: 14, font: sans })
  page.drawLine({
    start: { x: 240, y: nameY - 4 },
    end: { x: 650, y: nameY - 4 },
    thickness: 0.75,
    color: rgb(0.6, 0.6, 0.6),
  })

  centerText(`has achieved the rank of ${rank}`, 270, serif, 22, rgb(0.55, 0.1, 0.1))

  page.drawText('Date:', { x: 150, y: dateY, size: 14, font: sans })
  page.drawLine({
    start: { x: 240, y: dateY - 4 },
    end: { x: 450, y: dateY - 4 },
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
  for (const [rank, byType] of Object.entries(RANK_TEMPLATES)) {
    for (const template of Object.values(byType)) {
      if (!template.isPlaceholder) continue
      const bytes = await buildTemplate(rank, template.namePlacement.y, template.datePlacement.y)
      fs.writeFileSync(path.join(OUTPUT_DIR, template.filename), bytes)
      console.log(`Wrote ${template.filename}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
