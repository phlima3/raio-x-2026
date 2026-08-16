interface CandidateIdentityRecord {
  id: string
  name: string
  state: string
  electionYear?: number
  personKey?: string | null
  tseId?: string | null
}

interface CanonicalCandidateRecord {
  id: string
  position: string
  isOfficial?: boolean
  tseId?: string | null
  candidacyStatus: string | null
  candidacyStatusSourceUrl?: string | null
  candidacyStatusVerifiedAt?: Date | null
  materialUpdatedAt: Date | null
  updatedAt: Date
}

const STATUS_RANK: Record<string, number> = {
  deferido: 90,
  registro_solicitado: 80,
  escolhido_convencao: 70,
  pre_candidato: 60,
  indeferido: 50,
  substituido: 40,
  desistiu: 40,
  cancelado: 30,
  pedido_nao_conhecido: 30,
  cassado: 30,
  falecido: 30,
  status_nao_mapeado: 20,
  confirmado: 30,
  cotado: 10,
}

const POSITION_RANK: Record<string, number> = {
  PRESIDENTE: 90,
  GOVERNADOR: 80,
  SENADOR: 70,
  DEPUTADO_FEDERAL: 60,
  DEPUTADO_ESTADUAL: 50,
  PREFEITO: 40,
  VEREADOR: 30,
  VICE_PRESIDENTE: 20,
  VICE_GOVERNADOR: 10,
}

function normalizeIdentityPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function makeCandidateSlug(name: string, party: string, state: string): string {
  return [name, party, state].map(normalizeIdentityPart).join('-')
}

export function parseCandidateSlug(slug: string): { state: string } | null {
  const parts = slug.split('-')
  if (parts.length < 3) return null
  const state = parts.at(-1)
  return state && /^[a-z]{2}$/i.test(state) ? { state: state.toUpperCase() } : null
}

export function personIdentityKey(name: string, state: string): string {
  return `${normalizeIdentityPart(name)}:${state.toUpperCase()}`
}

export function groupCandidateRecords<T extends CandidateIdentityRecord>(records: T[]): T[][] {
  const buckets = new Map<string, T[]>()
  for (const record of records) {
    // Nome/UF ajudam na auditoria e na URL, mas não provam identidade. Só uma
    // chave de pessoa explicitamente curada ou o identificador eleitoral pode
    // consolidar registros; sem isso, cada linha permanece isolada e o gate
    // bloqueia eventuais colisões em vez de escolher um homônimo.
    const positiveIdentity = record.personKey?.trim()
      ? `person-key:${record.personKey.trim().toLowerCase()}`
      : record.tseId
        ? `tse:${record.tseId}`
        : `record:${record.id}`
    const key = `${positiveIdentity}:${record.electionYear ?? 'sem-ano'}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(record)
    else buckets.set(key, [record])
  }
  return [...buckets.values()]
}

function comparableDate(value: Date | null): number {
  return value?.getTime() ?? 0
}

function isElectoralJusticeSource(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
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

function sourceAuthority(record: CanonicalCandidateRecord): number {
  if (record.isOfficial) return 4
  if (record.tseId) return 3
  if (isElectoralJusticeSource(record.candidacyStatusSourceUrl)) return 2
  return record.candidacyStatusSourceUrl ? 1 : 0
}

export function chooseCanonicalCandidate<T extends CanonicalCandidateRecord>(records: T[]): T {
  if (records.length === 0) {
    throw new Error('chooseCanonicalCandidate requires at least one record')
  }

  return [...records].sort((a, b) => {
    const authorityDifference = sourceAuthority(b) - sourceAuthority(a)
    if (authorityDifference !== 0) return authorityDifference

    const verificationDifference =
      comparableDate(b.candidacyStatusVerifiedAt ?? null) -
      comparableDate(a.candidacyStatusVerifiedAt ?? null)
    if (verificationDifference !== 0) return verificationDifference

    const materialDifference =
      comparableDate(b.materialUpdatedAt) - comparableDate(a.materialUpdatedAt)
    if (materialDifference !== 0) return materialDifference

    const positionDifference =
      (POSITION_RANK[b.position] ?? 0) - (POSITION_RANK[a.position] ?? 0)
    if (positionDifference !== 0) return positionDifference

    const updatedDifference = b.updatedAt.getTime() - a.updatedAt.getTime()
    if (updatedDifference !== 0) return updatedDifference

    const statusDifference =
      (STATUS_RANK[b.candidacyStatus ?? ''] ?? 0) -
      (STATUS_RANK[a.candidacyStatus ?? ''] ?? 0)
    if (statusDifference !== 0) return statusDifference

    return a.id.localeCompare(b.id)
  })[0]
}

export function deduplicateCandidateRecords<
  T extends CandidateIdentityRecord & CanonicalCandidateRecord,
>(records: T[]): T[] {
  return groupCandidateRecords(records).map(chooseCanonicalCandidate)
}
