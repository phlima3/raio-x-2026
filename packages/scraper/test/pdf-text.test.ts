import { describe, expect, it } from 'vitest'

import { extractPdfText, stripControlCharacters } from '../src/documents/pdfText'

function makePdf(content: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${content}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'binary')
}

describe('extractPdfText', () => {
  it('extracts text from a digitally generated official PDF', async () => {
    await expect(extractPdfText(makePdf('Programa oficial para educacao')))
      .resolves.toContain('Programa oficial para educacao')
  })

  it('returns an empty string for an image-only/blank PDF', async () => {
    await expect(extractPdfText(makePdf(''))).resolves.toBe('')
  })

  it('drops the control bytes broken PDF fonts emit, which PostgreSQL rejects', () => {
    const raw = 'Plano de' + '\u0000' + ' governo' + '\u001f\u0007'
    expect(stripControlCharacters(raw)).toBe('Plano de governo')
    expect(stripControlCharacters('linha 1\nlinha\t2')).toBe('linha 1\nlinha\t2')
  })
})
