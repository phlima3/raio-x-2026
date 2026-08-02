import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

interface PdfTextItem {
  str?: unknown
  hasEOL?: unknown
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

  return pages.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
