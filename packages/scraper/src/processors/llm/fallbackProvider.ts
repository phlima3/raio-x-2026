import { logger } from '../../utils/logger'
import type { LLMProvider, ProposalsByTheme } from './types'

/**
 * Encadeia providers: o primeiro responde, os seguintes cobrem a queda dele.
 *
 * O caso real é o free tier do Gemini, que engole um plano de governo inteiro
 * numa chamada mas tem cota diária. Esgotada a cota, um modelo local assume e a
 * rodada termina — mais devagar e lendo menos documento, mas termina.
 *
 * O fallback é para indisponibilidade, não para resposta ruim: se o provider
 * respondeu e o conteúdo não presta, quem decide é a revisão, não este arquivo.
 */
export class FallbackLLMProvider implements LLMProvider {
  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) throw new Error('FallbackLLMProvider precisa de ao menos um provider')
  }

  /** O teto do primeiro provider: é ele quem atende enquanto estiver de pé. */
  get inputBudget(): number {
    return this.providers[0].inputBudget
  }

  private async attempt<T>(operation: string, run: (provider: LLMProvider) => Promise<T>): Promise<T> {
    let lastError: unknown
    for (const [index, provider] of this.providers.entries()) {
      try {
        return await run(provider)
      } catch (error) {
        lastError = error
        const remaining = this.providers.length - index - 1
        logger.warn(
          `[llm] ${operation} falhou no provider ${index + 1}/${this.providers.length}` +
            (remaining > 0 ? '; tentando o próximo' : '; sem fallback restante'),
          error instanceof Error ? error.message : error,
        )
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  complete(prompt: string): Promise<string> {
    return this.attempt('complete', (provider) => provider.complete(prompt))
  }

  extractProposals(text: string): Promise<ProposalsByTheme> {
    return this.attempt('extractProposals', (provider) => provider.extractProposals(text))
  }

  summarizeProposal(ementa: string, text: string): Promise<string> {
    return this.attempt('summarizeProposal', (provider) => provider.summarizeProposal(ementa, text))
  }

  summarizeBio(bioText: string, candidateName: string): Promise<string> {
    return this.attempt('summarizeBio', (provider) => provider.summarizeBio(bioText, candidateName))
  }

  compareProposals(
    theme: string,
    proposalsA: string[],
    proposalsB: string[],
    nameA: string,
    nameB: string,
  ): Promise<string> {
    return this.attempt('compareProposals', (provider) =>
      provider.compareProposals(theme, proposalsA, proposalsB, nameA, nameB))
  }
}
