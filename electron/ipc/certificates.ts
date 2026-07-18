import { app, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { RANK_TEMPLATE_FILES, NAME_POSITION, DATE_POSITION, isCertificateRank } from '../certificates/ranks.ts'
import type { CertificateInput } from '../../shared/types.ts'

const templatesDir = app.isPackaged
  ? path.join(process.resourcesPath, 'certificates')
  : path.join(app.getAppPath(), 'electron', 'certificates', 'templates')

function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Only ranks with both a mapping entry AND an actual file on disk are
// offered, so a missing/not-yet-provided template quietly disappears from
// the picker instead of producing a broken option.
export function listAvailableCertificateRanks(): string[] {
  return (Object.entries(RANK_TEMPLATE_FILES) as [string, string][])
    .filter(([, filename]) => fs.existsSync(path.join(templatesDir, filename)))
    .map(([rank]) => rank)
}

export async function generateCertificateBytes(input: CertificateInput) {
  if (!isCertificateRank(input.rank)) {
    throw new Error(`No certificate template available for rank "${input.rank}".`)
  }
  const templatePath = path.join(templatesDir, RANK_TEMPLATE_FILES[input.rank]!)
  if (!fs.existsSync(templatePath)) {
    throw new Error(`No certificate template available for rank "${input.rank}".`)
  }

  const pdfDoc = await PDFDocument.load(fs.readFileSync(templatePath))
  const page = pdfDoc.getPages()[0]
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const color = rgb(0.1, 0.1, 0.1)

  page.drawText(input.name, { x: NAME_POSITION.x, y: NAME_POSITION.y, size: 20, font, color })
  page.drawText(formatDate(input.date), { x: DATE_POSITION.x, y: DATE_POSITION.y, size: 14, font, color })

  return pdfDoc.save()
}

export function registerCertificateHandlers() {
  ipcMain.handle('certificates:listAvailableRanks', () => listAvailableCertificateRanks())

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
