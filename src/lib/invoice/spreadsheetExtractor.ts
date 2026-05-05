// ─── Spreadsheet text extractor ──────────────────────────────────────────────
// Converts .xlsx / .xls / .csv files into a plain-text tabular representation
// that Claude can parse the same way it parses bank-statement text.

import * as XLSX from 'xlsx'

export const SPREADSHEET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  'text/csv',                                                          // .csv
  'application/csv',
] as const

export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.tsv', '.ods'] as const

export function isSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase()
  if (SPREADSHEET_EXTENSIONS.some(ext => name.endsWith(ext))) return true
  if (SPREADSHEET_MIME_TYPES.includes(file.type as typeof SPREADSHEET_MIME_TYPES[number])) return true
  return false
}

export async function extractSpreadsheetText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })

  const sections: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const csv = XLSX.utils.sheet_to_csv(sheet, {
      blankrows: false,
      rawNumbers: false,
      dateNF: 'yyyy-mm-dd',
    }).trim()

    if (!csv) continue

    if (workbook.SheetNames.length > 1) {
      sections.push(`--- Aba: ${sheetName} ---\n${csv}`)
    } else {
      sections.push(csv)
    }
  }

  return sections.join('\n\n')
}
