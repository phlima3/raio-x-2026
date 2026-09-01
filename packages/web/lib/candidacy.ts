export interface CandidacyStatusPresentation {
  label: string
  description: string
  tone: 'neutral' | 'attention' | 'verified' | 'closed'
  requiresReview: boolean
}

const STATUS_PRESENTATIONS: Record<string, CandidacyStatusPresentation> = {
  cotado: {
    label: 'Nome cotado',
    description: 'Citado no debate eleitoral, sem candidatura formal identificada.',
    tone: 'neutral',
    requiresReview: false,
  },
  pre_candidato: {
    label: 'Pré-candidatura anunciada',
    description: 'A intenção de disputar foi anunciada, antes da formalização do registro.',
    tone: 'attention',
    requiresReview: false,
  },
  escolhido_convencao: {
    label: 'Escolhido em convenção',
    description: 'O nome foi escolhido em convenção partidária.',
    tone: 'attention',
    requiresReview: false,
  },
  registro_solicitado: {
    label: 'Registro solicitado à Justiça Eleitoral',
    description: 'O pedido foi protocolado e aguarda decisão da Justiça Eleitoral.',
    tone: 'attention',
    requiresReview: false,
  },
  deferido: {
    label: 'Registro deferido',
    description: 'A Justiça Eleitoral deferiu o registro da candidatura.',
    tone: 'verified',
    requiresReview: false,
  },
  indeferido: {
    label: 'Registro indeferido',
    description: 'A Justiça Eleitoral indeferiu o registro; consulte a fonte para recursos.',
    tone: 'closed',
    requiresReview: false,
  },
  desistiu: {
    label: 'Desistiu da disputa',
    description: 'A retirada da candidatura ou pré-candidatura foi comunicada.',
    tone: 'closed',
    requiresReview: false,
  },
  substituido: {
    label: 'Candidatura substituída',
    description: 'Outra pessoa passou a ocupar esta candidatura.',
    tone: 'closed',
    requiresReview: false,
  },
  cancelado: {
    label: 'Registro cancelado',
    description: 'A Justiça Eleitoral registra a candidatura como cancelada.',
    tone: 'closed',
    requiresReview: false,
  },
  pedido_nao_conhecido: {
    label: 'Pedido não conhecido',
    description: 'A Justiça Eleitoral não conheceu o pedido de registro.',
    tone: 'closed',
    requiresReview: false,
  },
  cassado: {
    label: 'Registro cassado',
    description: 'A Justiça Eleitoral registra a cassação; consulte a decisão e eventuais recursos.',
    tone: 'closed',
    requiresReview: false,
  },
  falecido: {
    label: 'Falecimento registrado',
    description: 'O conjunto oficial registra o falecimento da pessoa candidata.',
    tone: 'closed',
    requiresReview: false,
  },
  status_nao_mapeado: {
    label: 'Situação oficial em revisão',
    description: 'O TSE publicou um rótulo ainda não classificado pelo Raio-X.',
    tone: 'neutral',
    requiresReview: true,
  },
}

const REVIEW_REQUIRED: CandidacyStatusPresentation = {
  label: 'Situação não verificada',
  description: 'O status eleitoral precisa ser conferido em uma fonte identificada.',
  tone: 'neutral',
  requiresReview: true,
}

export function candidacyStatusPresentation(
  status: string | null | undefined,
): CandidacyStatusPresentation {
  if (!status) return REVIEW_REQUIRED
  return STATUS_PRESENTATIONS[status] ?? REVIEW_REQUIRED
}

/**
 * O TSE publica tanto páginas de candidatura quanto pacotes do catálogo, e o
 * rótulo do link tem de dizer a verdade sobre o clique: uma abre para leitura,
 * o outro cai na pasta de downloads.
 */
const FILE_URL = /\.(pdf|zip)(\?|#|$)/i

export function opensAsDownload(url: string): boolean {
  return FILE_URL.test(url)
}
