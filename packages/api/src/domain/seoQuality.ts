export type SeoBlockerCode =
  | 'identidade_incompleta'
  | 'identidade_nao_confirmada'
  | 'colisao_slug'
  | 'vice_incompleto'
  | 'status_nao_qualificado'
  | 'status_sem_fonte'
  | 'status_formal_sem_fonte_oficial'
  | 'status_sem_data_verificacao'
  | 'introducao_insuficiente'
  | 'trajetoria_sem_fonte'
  | 'menos_de_tres_modulos'
  | 'atualizacao_material_ausente'
  | 'revisao_editorial_ausente'
  | 'aprovacao_editorial_ausente'
  | 'autoria_ausente'
  | 'revisor_ausente'
  | 'revisao_anterior_a_atualizacao'
  | 'placeholder_detectado'
  | 'imagem_insegura'
  | 'credito_de_imagem_ausente'

export type SeoWarningCode = 'verificacao_de_status_desatualizada'

export type SubstantiveModule =
  | 'trajetoria'
  | 'propostas'
  | 'votacoes'
  | 'patrimonio'
  | 'financiamento'
  | 'declaracoes'

export interface CandidateQualityInput {
  slug: string | null
  personKey: string | null
  tseId: string | null
  name: string
  party: string
  state: string
  position: string
  electionYear: number
  runningMateName: string | null
  runningMateParty: string | null
  runningMateSourceUrl: string | null
  candidacyStatus: string | null
  candidacyStatusSourceUrl: string | null
  candidacyStatusVerifiedAt: Date | string | null
  bioSummary: string | null
  bio: string | null
  bioSourceUrl: string | null
  materialUpdatedAt: Date | string | null
  reviewedAt: Date | string | null
  editorialApprovedAt: Date | string | null
  editorialAuthor: string | null
  editorialReviewer: string | null
  photoUrl: string | null
  photoSourceUrl: string | null
  photoLicense: string | null
  proposals: Array<{
    title: string
    description: string | null
    summary: string | null
    url: string | null
  }>
  votingRecords: Array<{
    proposalName: string
    proposalUrl: string | null
  }>
  assetDeclarations: Array<{ sourceUrl: string | null }>
  campaignFinancings: Array<{ sourceUrl: string | null }>
  newsItems: Array<{
    headline?: string
    title?: string
    summary: string
    url?: string | null
    sourceUrl?: string | null
  }>
}

export interface CandidateIndexability {
  indexable: boolean
  blockers: SeoBlockerCode[]
  warnings: SeoWarningCode[]
  substantiveModules: SubstantiveModule[]
}

export const SEO_BLOCKER_MESSAGES: Record<SeoBlockerCode, string> = {
  identidade_incompleta: 'Identidade eleitoral incompleta.',
  identidade_nao_confirmada:
    'A pessoa ainda não possui chave de identidade curada nem identificador do TSE.',
  colisao_slug:
    'A URL canônica coincide com a de outra pessoa e precisa ser desambiguada editorialmente.',
  vice_incompleto: 'A chapa presidencial formalizada não possui vice e fonte completos.',
  status_nao_qualificado: 'A situação eleitoral ainda não qualifica o perfil para indexação.',
  status_sem_fonte: 'A situação eleitoral não possui uma fonte HTTPS registrada.',
  status_formal_sem_fonte_oficial:
    'O status formal de registro não possui fonte identificada da Justiça Eleitoral.',
  status_sem_data_verificacao: 'A situação eleitoral não possui data de verificação.',
  introducao_insuficiente: 'A introdução exclusiva está ausente, curta ou contém placeholder.',
  trajetoria_sem_fonte: 'A trajetória/biografia não possui uma fonte HTTPS registrada.',
  menos_de_tres_modulos: 'Há menos de três módulos substantivos apoiados por fontes.',
  atualizacao_material_ausente: 'A última atualização material não foi registrada.',
  revisao_editorial_ausente: 'A revisão editorial não foi registrada.',
  aprovacao_editorial_ausente: 'A aprovação editorial não foi registrada.',
  autoria_ausente: 'A autoria editorial não foi identificada.',
  revisor_ausente: 'A pessoa ou equipe revisora não foi identificada.',
  revisao_anterior_a_atualizacao: 'O conteúdo mudou depois da última revisão/aprovação.',
  placeholder_detectado: 'Foi encontrado texto provisório ou placeholder.',
  imagem_insegura: 'A foto usa HTTP ou um endereço inválido.',
  credito_de_imagem_ausente: 'A origem ou licença/crédito da foto não foi registrada.',
}

export function findCollidingCanonicalSlugs(
  candidates: Array<{ slug: string }>,
): Set<string> {
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    counts.set(candidate.slug, (counts.get(candidate.slug) ?? 0) + 1)
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([slug]) => slug),
  )
}

const QUALIFYING_STATUSES = new Set([
  'pre_candidato',
  'escolhido_convencao',
  'registro_solicitado',
  'deferido',
  'indeferido',
  'desistiu',
  'substituido',
])

const OFFICIAL_SOURCE_REQUIRED_STATUSES = new Set([
  'registro_solicitado',
  'deferido',
  'indeferido',
  'substituido',
  'cancelado',
  'pedido_nao_conhecido',
  'cassado',
  'falecido',
  'status_nao_mapeado',
])

const RUNNING_MATE_REQUIRED_STATUSES = new Set([
  'escolhido_convencao',
  'registro_solicitado',
  'deferido',
  'indeferido',
])

/**
 * Frases que não aparecem em texto publicável onde quer que estejam: quem
 * escreve "em breve" ou "a definir" no meio de uma proposta está entregando
 * rascunho.
 */
const PLACEHOLDER_PATTERN =
  /\b(?:proposta\s*\d+|em\s+breve|lorem\s+ipsum|conte[uú]do\s+em\s+atualiza[cç][aã]o|perfil\s+em\s+atualiza[cç][aã]o|a\s+definir|placeholder)\b/i

/**
 * "teste" é rascunho quando é o campo inteiro, e conteúdo quando está numa
 * frase: plano de governo fala em "ambientes de teste", "teste piloto",
 * "banco de testes". Como token solto na lista acima ele reprovava proposta
 * legítima — o plano do Haddad em SP caiu por "regras estáveis, ambientes de
 * teste e talento formado em escala".
 */
const PLACEHOLDER_ONLY_PATTERN = /^[\s\p{P}]*teste\s*\d*[\s\p{P}]*$/iu

function isPlaceholderText(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value) || PLACEHOLDER_ONLY_PATTERN.test(value)
}

function hasText(value: string | null | undefined, minimumLength = 1): boolean {
  return Boolean(value && value.trim().length >= minimumLength)
}

function isHttpsUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isElectoralJusticeUrl(value: string | null | undefined): boolean {
  if (!isHttpsUrl(value)) return false
  const hostname = new URL(value as string).hostname.toLowerCase()
  return (
    hostname === 'tse.jus.br' ||
    hostname.endsWith('.tse.jus.br') ||
    /(^|\.)tre-[a-z]{2}\.jus\.br$/.test(hostname)
  )
}

function isSafeImageUrl(value: string): boolean {
  return value.startsWith('/') || isHttpsUrl(value)
}

function dateValue(value: Date | string | null): number | null {
  if (!value) return null
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function containsPlaceholder(candidate: CandidateQualityInput): boolean {
  const proposalCopy = candidate.proposals.flatMap((proposal) => [
    proposal.title,
    proposal.description,
    proposal.summary,
  ])
  return [candidate.bioSummary, candidate.bio, ...proposalCopy].some(
    (value) => value != null && isPlaceholderText(value),
  )
}

function substantiveModules(candidate: CandidateQualityInput): SubstantiveModule[] {
  const modules: SubstantiveModule[] = []

  if (hasText(candidate.bio, 100) && isHttpsUrl(candidate.bioSourceUrl)) {
    modules.push('trajetoria')
  }

  const sourcedProposals = candidate.proposals.filter((proposal) => {
    const body = proposal.summary ?? proposal.description
    return (
      hasText(proposal.title, 12) &&
      hasText(body, 40) &&
      isHttpsUrl(proposal.url) &&
      !isPlaceholderText(`${proposal.title} ${body}`)
    )
  })
  if (sourcedProposals.length >= 2) modules.push('propostas')

  const sourcedVotes = candidate.votingRecords.filter(
    (vote) => hasText(vote.proposalName, 5) && isHttpsUrl(vote.proposalUrl),
  )
  if (sourcedVotes.length >= 3) modules.push('votacoes')

  if (candidate.assetDeclarations.some((item) => isHttpsUrl(item.sourceUrl))) {
    modules.push('patrimonio')
  }

  if (candidate.campaignFinancings.some((item) => isHttpsUrl(item.sourceUrl))) {
    modules.push('financiamento')
  }

  const sourcedNews = candidate.newsItems.filter((item) => {
    const title = item.headline ?? item.title
    const sourceUrl = item.url ?? item.sourceUrl
    return hasText(title, 12) && hasText(item.summary, 40) && isHttpsUrl(sourceUrl)
  })
  if (sourcedNews.length >= 2) modules.push('declaracoes')

  return modules
}

export function evaluateCandidateIndexability(
  candidate: CandidateQualityInput,
  options: { now?: Date; staleStatusAfterHours?: number } = {},
): CandidateIndexability {
  const blockers: SeoBlockerCode[] = []
  const warnings: SeoWarningCode[] = []
  const modules = substantiveModules(candidate)

  if (
    !hasText(candidate.slug, 3) ||
    !hasText(candidate.name, 3) ||
    !hasText(candidate.party, 2) ||
    !/^[A-Z]{2}$/.test(candidate.state) ||
    !hasText(candidate.position, 3) ||
    candidate.electionYear !== 2026
  ) {
    blockers.push('identidade_incompleta')
  }
  if (!hasText(candidate.personKey, 3) && !hasText(candidate.tseId, 3)) {
    blockers.push('identidade_nao_confirmada')
  }
  if (
    candidate.position === 'PRESIDENTE' &&
    candidate.candidacyStatus &&
    RUNNING_MATE_REQUIRED_STATUSES.has(candidate.candidacyStatus) &&
    (!hasText(candidate.runningMateName, 3) ||
      !hasText(candidate.runningMateParty, 2) ||
      !isHttpsUrl(candidate.runningMateSourceUrl))
  ) {
    blockers.push('vice_incompleto')
  }

  if (!candidate.candidacyStatus || !QUALIFYING_STATUSES.has(candidate.candidacyStatus)) {
    blockers.push('status_nao_qualificado')
  }
  if (!isHttpsUrl(candidate.candidacyStatusSourceUrl)) blockers.push('status_sem_fonte')
  if (
    candidate.candidacyStatus &&
    OFFICIAL_SOURCE_REQUIRED_STATUSES.has(candidate.candidacyStatus) &&
    !isElectoralJusticeUrl(candidate.candidacyStatusSourceUrl)
  ) {
    blockers.push('status_formal_sem_fonte_oficial')
  }

  const verifiedAt = dateValue(candidate.candidacyStatusVerifiedAt)
  if (verifiedAt == null) {
    blockers.push('status_sem_data_verificacao')
  } else {
    const now = (options.now ?? new Date()).getTime()
    const staleAfterMs = (options.staleStatusAfterHours ?? 48) * 60 * 60 * 1000
    if (now - verifiedAt > staleAfterMs) {
      warnings.push('verificacao_de_status_desatualizada')
    }
  }

  if (
    !hasText(candidate.bioSummary, 100) ||
    (candidate.bioSummary != null && isPlaceholderText(candidate.bioSummary))
  ) {
    blockers.push('introducao_insuficiente')
  }
  if (!isHttpsUrl(candidate.bioSourceUrl)) blockers.push('trajetoria_sem_fonte')
  if (modules.length < 3) blockers.push('menos_de_tres_modulos')

  const materialUpdatedAt = dateValue(candidate.materialUpdatedAt)
  const reviewedAt = dateValue(candidate.reviewedAt)
  const approvedAt = dateValue(candidate.editorialApprovedAt)
  if (materialUpdatedAt == null) blockers.push('atualizacao_material_ausente')
  if (reviewedAt == null) blockers.push('revisao_editorial_ausente')
  if (approvedAt == null) blockers.push('aprovacao_editorial_ausente')
  if (!hasText(candidate.editorialAuthor, 3)) blockers.push('autoria_ausente')
  if (!hasText(candidate.editorialReviewer, 3)) blockers.push('revisor_ausente')
  if (
    materialUpdatedAt != null &&
    ((reviewedAt != null && reviewedAt < materialUpdatedAt) ||
      (approvedAt != null && approvedAt < materialUpdatedAt))
  ) {
    blockers.push('revisao_anterior_a_atualizacao')
  }

  if (containsPlaceholder(candidate)) blockers.push('placeholder_detectado')

  if (candidate.photoUrl) {
    if (!isSafeImageUrl(candidate.photoUrl)) blockers.push('imagem_insegura')
    if (!isHttpsUrl(candidate.photoSourceUrl) || !hasText(candidate.photoLicense, 3)) {
      blockers.push('credito_de_imagem_ausente')
    }
  }

  return {
    indexable: blockers.length === 0,
    blockers,
    warnings,
    substantiveModules: modules,
  }
}
