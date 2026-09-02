import assert from 'node:assert/strict'
import test from 'node:test'

import { CodexProvider } from './codexProvider'
import { createProvider } from './index'

test('orcamento de entrada cobre plano de governo, nao os 12k do default', () => {
  // Os planos do TSE tem de 16 mil a 320 mil caracteres. Herdar o default
  // truncaria o documento sem dizer onde.
  assert.ok(new CodexProvider().inputBudget >= 100_000)
})

test('CODEX_INPUT_BUDGET valido substitui o default; lixo e ignorado', () => {
  const original = process.env.CODEX_INPUT_BUDGET
  try {
    process.env.CODEX_INPUT_BUDGET = '50000'
    assert.equal(new CodexProvider().inputBudget, 50_000)
    for (const invalido of ['0', '-1', 'abc', '']) {
      process.env.CODEX_INPUT_BUDGET = invalido
      assert.ok(new CodexProvider().inputBudget >= 100_000, `deveria ignorar ${invalido}`)
    }
  } finally {
    if (original === undefined) delete process.env.CODEX_INPUT_BUDGET
    else process.env.CODEX_INPUT_BUDGET = original
  }
})

test('binario ausente falha dizendo qual comando faltou', async () => {
  const original = process.env.CODEX_BIN
  try {
    process.env.CODEX_BIN = 'codex-que-nao-existe-raiox'
    await assert.rejects(
      new CodexProvider().complete('oi'),
      /codex-que-nao-existe-raiox/,
    )
  } finally {
    if (original === undefined) delete process.env.CODEX_BIN
    else process.env.CODEX_BIN = original
  }
})

test('LLM_PROVIDER=codex seleciona o provider', () => {
  const original = process.env.LLM_PROVIDER
  try {
    process.env.LLM_PROVIDER = 'codex'
    assert.ok(createProvider() instanceof CodexProvider)
  } finally {
    if (original === undefined) delete process.env.LLM_PROVIDER
    else process.env.LLM_PROVIDER = original
  }
})
