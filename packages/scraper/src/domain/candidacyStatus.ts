import type { CandidacyStatus } from '../processors/presidentialExtractor'

// Ranking is only a fallback between non-official sources. Electoral-justice
// decisions can reverse after an appeal and are handled by source authority.
const STATUS_PRIORITY: Record<CandidacyStatus, number> = {
  substituido: 100,
  desistiu: 100,
  cancelado: 100,
  pedido_nao_conhecido: 100,
  cassado: 100,
  falecido: 100,
  status_nao_mapeado: 100,
  indeferido: 90,
  deferido: 80,
  registro_solicitado: 70,
  escolhido_convencao: 60,
  pre_candidato: 40,
  cotado: 10,
}

const TERMINAL_STATUSES = new Set<CandidacyStatus>([
  'desistiu',
  'substituido',
  'cancelado',
  'pedido_nao_conhecido',
  'cassado',
  'falecido',
  'status_nao_mapeado',
])

export function isElectoralJusticeSource(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    return (
      hostname === 'tse.jus.br' ||
      hostname.endsWith('.tse.jus.br') ||
      /(^|\.)tre-[a-z]{2}\.jus\.br$/.test(hostname)
    )
  } catch {
    return false
  }
}

export function shouldAcceptIncomingStatus(input: {
  currentStatus: string | null | undefined
  currentSourceUrl: string | null | undefined
  incomingStatus: CandidacyStatus
  incomingSourceUrl: string | null | undefined
}): boolean {
  const {
    currentStatus,
    currentSourceUrl,
    incomingStatus,
    incomingSourceUrl,
  } = input
  if (!currentStatus) return true

  const currentIsOfficial = isElectoralJusticeSource(currentSourceUrl)
  const incomingIsOfficial = isElectoralJusticeSource(incomingSourceUrl)

  // The current official snapshot supersedes prior inference and permits
  // non-monotonic changes after appeals.
  if (incomingIsOfficial) return true
  if (currentIsOfficial) {
    return currentStatus !== 'substituido' && incomingStatus === 'desistiu'
  }

  if (incomingStatus === currentStatus) return true
  if (TERMINAL_STATUSES.has(currentStatus as CandidacyStatus)) return false

  return (
    (STATUS_PRIORITY[incomingStatus] ?? 0) >=
    (STATUS_PRIORITY[currentStatus as CandidacyStatus] ?? 0)
  )
}
