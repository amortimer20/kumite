import { app, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { getCertificateTemplate, RANK_TEMPLATES, type TextPlacement } from '../certificates/ranks.ts'
import type { CertificateInput, CertificateType } from '../../shared/types.ts'

const templatesDir = app.isPackaged
  ? path.join(process.resourcesPath, 'certificates')
  : path.join(app.getAppPath(), 'electron', 'certificates', 'templates')

function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Only ranks with both a mapping entry for this type AND an actual file on
// disk are offered, so a missing/not-yet-provided template quietly
// disappears from the picker instead of producing a broken option.
export function listAvailableCertificateRanks(type: CertificateType): string[] {
  return Object.keys(RANK_TEMPLATES).filter((rank) => {
    const template = getCertificateTemplate(rank, type)
    return template && fs.existsSync(path.join(templatesDir, template.filename))
  })
}

// `x` is a left edge, unless `centered` is set — then it's the horizontal
// center to balance the text under (needed where the string's width varies,
// e.g. a date's length depends on the month name).
function resolveX(placement: TextPlacement, text: string, font: PDFFont) {
  if (!placement.centered) return placement.x
  return placement.x - font.widthOfTextAtSize(text, placement.size) / 2
}

export async function generateCertificateBytes(input: CertificateInput) {
  const template = getCertificateTemplate(input.rank, input.type)
  const templatePath = template && path.join(templatesDir, template.filename)
  if (!template || !templatePath || !fs.existsSync(templatePath)) {
    throw new Error(`No ${input.type} certificate template available for rank "${input.rank}".`)
  }

  const pdfDoc = await PDFDocument.load(fs.readFileSync(templatePath))
  const page = pdfDoc.getPages()[0]
  const fonts = {
    TimesRomanBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    HelveticaBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  }

  const { namePlacement, datePlacement } = template
  const nameFont = fonts[namePlacement.font]
  page.drawText(input.name, {
    x: resolveX(namePlacement, input.name, nameFont),
    y: namePlacement.y,
    size: namePlacement.size,
    font: nameFont,
    color: rgb(...namePlacement.color),
  })
  const formattedDate = formatDate(input.date)
  const dateFont = fonts[datePlacement.font]
  page.drawText(formattedDate, {
    x: resolveX(datePlacement, formattedDate, dateFont),
    y: datePlacement.y,
    size: datePlacement.size,
    font: dateFont,
    color: rgb(...datePlacement.color),
  })

  return pdfDoc.save()
}

export function registerCertificateHandlers() {
  ipcMain.handle('certificates:listAvailableRanks', (_event, type: CertificateType) => listAvailableCertificateRanks(type))

  ipcMain.handle('certificates:print', async (_event, input: CertificateInput) => {
    const bytes = await generateCertificateBytes(input)
    // Electron's own print pipeline has known, hard-to-diagnose bugs when
    // the content being printed is itself a loaded PDF (its built-in PDFium
    // viewer doesn't reliably hand off to the print pipeline — printing a
    // blank page is a common symptom). Opening the file in the OS's default
    // PDF viewer instead is far more reliable: printing from there is a
    // normal, well-supported action in whatever app opens (Preview, Acrobat,
    // Edge, etc.), not something fighting Electron internals.
    const tempPath = path.join(os.tmpdir(), `kumite-certificate-${crypto.randomUUID()}.pdf`)
    fs.writeFileSync(tempPath, bytes)
    const errorMessage = await shell.openPath(tempPath)
    if (errorMessage) {
      throw new Error(errorMessage)
    }
  })
}
