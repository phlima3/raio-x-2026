import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

interface PdfTextItem {
  str?: unknown
  hasEOL?: unknown
}

/**
 * Fontes com codificação própria devolvem bytes de controle no lugar de letras.
 * O `NUL` é fatal — o PostgreSQL rejeita a gravação inteira com o erro 22021 —
 * e os demais controles C0 são ruído que seguiria para prompt e tela.
 */
export function stripControlCharacters(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
}

export async function extractPdfText(bytes: Buffer): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map((item) => {
        const candidate = item as PdfTextItem
        if (typeof candidate.str !== 'string') return ''
        return candidate.hasEOL ? `${candidate.str}\n` : candidate.str
      }).join(' ')
      pages.push(text)
    }
  } finally {
    await document.destroy()
  }

  return stripControlCharacters(pages.join('\n'))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
