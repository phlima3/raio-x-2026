import { describe, expect, it, vi } from 'vitest'

import { FallbackLLMProvider } from '../src/processors/llm/fallbackProvider'
import { retryDelayMs } from '../src/processors/llm/geminiProvider'
import { BaseLLMProvider } from '../src/processors/llm/baseProvider'
import type { LLMProvider } from '../src/processors/llm/types'

class StubProvider extends BaseLLMProvider {
  protected readonly providerName = 'stub'
  constructor(
    private readonly response: string | Error,
    readonly inputBudget = 12_000,
  ) {
    super()
  }

  async complete(): Promise<string> {
    if (this.response instanceof Error) throw this.response
    return this.response
  }
}

const THEMES = JSON.stringify({ economia: ['Reforma tributária ampla'] })

describe('FallbackLLMProvider', () => {
  it('usa o segundo provider quando o primeiro cai', async () => {
    const down = new StubProvider(new Error('429 quota exceeded'))
    const local = new StubProvider(THEMES)
    const spy = vi.spyOn(local, 'complete')

    const result = await new FallbackLLMProvider([down, local]).extractProposals(
      'Texto longo o suficiente para o provider aceitar processar esta entrada.',
    )

    expect(result.economia).toEqual(['Reforma tributária ampla'])
    expect(spy).toHaveBeenCalledOnce()
  })

  it('não chama o fallback quando o primeiro responde', async () => {
    const primary = new StubProvider(THEMES)
    const fallback = new StubProvider(THEMES)
    const spy = vi.spyOn(fallback, 'complete')

    await new FallbackLLMProvider([primary, fallback]).extractProposals(
      'Texto longo o suficiente para o provider aceitar processar esta entrada.',
    )

    expect(spy).not.toHaveBeenCalled()
  })

  it('propaga o erro quando todos caem, para não confundir queda com vazio', async () => {
    const chain = new FallbackLLMProvider([
      new StubProvider(new Error('primeiro fora')),
      new StubProvider(new Error('segundo fora')),
    ])

    await expect(chain.extractProposals(
      'Texto longo o suficiente para o provider aceitar processar esta entrada.',
    )).rejects.toThrow('segundo fora')
  })

  it('declara o orçamento de entrada do provider que atende', () => {
    const chain: LLMProvider = new FallbackLLMProvider([
      new StubProvider(THEMES, 900_000),
      new StubProvider(THEMES, 12_000),
    ])

    expect(chain.inputBudget).toBe(900_000)
  })
})

describe('BaseLLMProvider', () => {
  it('respeita o orçamento de entrada do provider ao montar o prompt', async () => {
    // Sem isto, um plano de governo de 320 mil caracteres era lido pelos
    // primeiros 12 mil — 4% do documento — e o resto virava silêncio.
    const wide = new StubProvider(THEMES, 900_000)
    const spy = vi.spyOn(wide, 'complete')
    const document = 'PLANO DE GOVERNO. '.repeat(10_000)

    await wide.extractProposals(document)

    expect(spy.mock.calls[0]?.[0]).toContain(document)
  })
})

describe('retryDelayMs', () => {
  const perMinute = new Error(
    '[429 Too Many Requests] Quota exceeded for metric: ..._input_token_count, ' +
    '"quotaId":"GenerateContentInputTokensPerModelPerMinute-FreeTier" ' +
    '{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37.9s"}',
  )
  const perDay = new Error(
    '[429 Too Many Requests] Quota exceeded for metric: ..._requests, limit: 20, ' +
    '"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier" ' +
    '{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37.4s"}',
  )

  it('espera o que o servidor pede quando a janela do minuto passa sozinha', () => {
    // Foi este caso que deixou Caiado sem propostas com o PDF já em mãos.
    expect(retryDelayMs(perMinute)).toBe(38_900)
  })

  it('não espera pela cota diária, que não passa dentro da execução', () => {
    expect(retryDelayMs(perDay)).toBeNull()
  })

  it('ignora erro que não é de cota', () => {
    expect(retryDelayMs(new Error('500 internal'))).toBeNull()
  })
})
