export interface CandidateSearchIntent {
  primary: string
  secondary: string[]
  validation: 'hipotese_aguardando_search_console'
}

export function buildCandidateSearchIntent(name: string): CandidateSearchIntent {
  const normalizedName = name.trim().replace(/\s+/g, ' ')
  return {
    primary: `${normalizedName} eleições 2026`,
    secondary: [
      `${normalizedName} candidato 2026`,
      `${normalizedName} propostas 2026`,
      `${normalizedName} plano de governo`,
      `${normalizedName} partido`,
      `${normalizedName} vice`,
      `${normalizedName} patrimônio declarado`,
      `${normalizedName} como votou`,
      `${normalizedName} posição sobre {tema}`,
      `${normalizedName} comparação com {outro candidato}`,
    ],
    validation: 'hipotese_aguardando_search_console',
  }
}
