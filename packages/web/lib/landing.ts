import type { CandidateSeoReportItem } from './types'

export const BRAZIL_STATES: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

export const LANDING_THEMES = {
  economia: {
    label: 'Economia',
    description:
      'Propostas sobre emprego, renda, impostos, contas públicas, crédito, indústria e desenvolvimento.',
  },
  saude: {
    label: 'Saúde',
    description:
      'Propostas para o SUS, atenção básica, hospitais, medicamentos, prevenção e gestão da saúde.',
  },
  educacao: {
    label: 'Educação',
    description:
      'Propostas para educação básica, ensino técnico e superior, professores e financiamento.',
  },
  seguranca: {
    label: 'Segurança',
    description:
      'Propostas sobre prevenção, policiamento, sistema penal, inteligência e segurança pública.',
  },
  'meio-ambiente': {
    label: 'Meio ambiente',
    description:
      'Propostas sobre clima, fiscalização, conservação, energia, agropecuária e transição ecológica.',
  },
} as const

export type LandingThemeSlug = keyof typeof LANDING_THEMES

export function topicSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function filterQualifiedCandidates(
  candidates: CandidateSeoReportItem[],
  filters: { position?: string; state?: string; topic?: string } = {},
): CandidateSeoReportItem[] {
  return candidates
    .filter((candidate) => candidate.indexable)
    .filter((candidate) => !filters.position || candidate.position === filters.position)
    .filter((candidate) => !filters.state || candidate.state === filters.state.toUpperCase())
    .filter(
      (candidate) =>
        !filters.topic || candidate.topics.some((topic) => topicSlug(topic) === filters.topic),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
