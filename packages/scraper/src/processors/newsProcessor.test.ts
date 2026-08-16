import assert from 'node:assert/strict'
import test from 'node:test'

import { detectContradiction } from './contradictionDetector'
import { fetchCandidateNews } from './newsProcessor'

test('does not turn a news provider failure into an empty source snapshot', async () => {
  const previous = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    await assert.rejects(
      fetchCandidateNews('Candidata Teste', 'economia'),
      /GEMINI_API_KEY not configured/,
    )
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previous
  }
})

test('does not turn a contradiction provider failure into a negative result', async () => {
  const previous = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    await assert.rejects(
      detectContradiction('Declaração', 'Resumo verificável', [{
        id: 'proposal-1',
        title: 'Proposta pública',
        description: 'Descrição da proposta',
        summary: null,
      }]),
      /GEMINI_API_KEY not configured/,
    )
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previous
  }
})
