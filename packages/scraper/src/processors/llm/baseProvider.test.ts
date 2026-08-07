import assert from 'node:assert/strict'
import test from 'node:test'
import { BaseLLMProvider } from './baseProvider'

class StubProvider extends BaseLLMProvider {
  protected readonly providerName = 'stub'

  constructor(private readonly response: () => Promise<string>) {
    super()
  }

  complete(): Promise<string> {
    return this.response()
  }
}

const longInput = 'Programa eleitoral com conteúdo verificável. '.repeat(4)

test('distinguishes a valid empty extraction from a provider failure', async () => {
  const validEmpty = new StubProvider(async () => '{}')
  const result = await validEmpty.extractProposals(longInput)
  assert.deepEqual(result, {
    economia: [],
    saude: [],
    educacao: [],
    seguranca: [],
    meioambiente: [],
    tecnologia: [],
    politicaexterna: [],
    outros: [],
  })

  const failed = new StubProvider(async () => {
    throw new Error('provider unavailable')
  })
  await assert.rejects(
    () => failed.extractProposals(longInput),
    /provider unavailable/,
  )
})
