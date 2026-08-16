import { prisma } from '../lib/prisma'
import { Position, Prisma, type Candidate, type Person } from '@prisma/client'

import {
  chooseCanonicalCandidate,
  groupCandidateRecords,
  makeCandidateSlug,
  parseCandidateSlug,
} from '../domain/candidateIdentity'
import {
  PUBLIC_ASSET_DECLARATION_LIMIT,
  PUBLIC_ASSET_DECLARATION_ORDER_BY,
  PUBLIC_ASSET_DECLARATION_WHERE,
  PUBLIC_CAMPAIGN_FINANCING_LIMIT,
  PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
  PUBLIC_CAMPAIGN_FINANCING_WHERE,
  PUBLIC_PROPOSAL_LIMIT,
  PUBLIC_PROPOSAL_ORDER_BY,
  PUBLIC_PROPOSAL_WHERE,
  PUBLIC_VOTING_RECORD_LIMIT,
  PUBLIC_VOTING_RECORD_ORDER_BY,
  PUBLIC_VOTING_RECORD_WHERE,
} from '../domain/publicationPolicy'
import type { CandidateFilters } from '../types/candidate'
import { cacheKey, TTL, withCache } from './cacheService'


export type CandidateReadModel = 'legacy' | 'normalized'

const PUBLIC_POSITIONS: Position[] = [
  Position.PRESIDENTE,
  Position.GOVERNADOR,
  Position.SENADOR,
]

export function getCandidateReadModel(): CandidateReadModel {
  return process.env.CANDIDATE_READ_MODEL === 'normalized' ? 'normalized' : 'legacy'
}

export function publicCandidateWhere(): Prisma.CandidateWhereInput {
  return {
    isPublished: true,
    position: { in: PUBLIC_POSITIONS },
  }
}

export function makeSlug(name: string, party: string, state: string): string {
  return makeCandidateSlug(name, party, state)
}

function identityFields<T extends { name: string; socialName: string | null; person?: Person | null }>(
  candidate: T,
  readModel: CandidateReadModel,
): Omit<T, 'person'> {
  const { person, ...rest } = candidate
  if (readModel !== 'normalized' || !person) return rest
  return {
    ...rest,
    name: person.name,
    socialName: person.socialName ?? candidate.socialName,
  }
}

function publicDetailFields<T extends Candidate & { person: Person | null }>(
  candidate: T,
  readModel: CandidateReadModel,
) {
  const {
    person,
    personId: _personId,
    electionId: _electionId,
    officialStatusRaw: _officialStatusRaw,
    isPublished: _isPublished,
    sourceUrl: _sourceUrl,
    syncRunId: _syncRunId,
    ...publicFields
  } = candidate
  if (readModel !== 'normalized' || !person) return publicFields
  return {
    ...publicFields,
    name: person.name,
    socialName: person.socialName ?? candidate.socialName,
  }
}

type CandidateListRow = Pick<
  Candidate,
  | 'id'
  | 'name'
  | 'socialName'
  | 'party'
  | 'state'
  | 'position'
  | 'photoUrl'
  | 'ballotNumber'
  | 'isIncumbent'
  | 'electionYear'
  | 'isOfficial'
  | 'officialStatus'
  | 'dataSource'
  | 'lastSyncedAt'
  | 'personKey'
  | 'tseId'
  | 'candidacyStatus'
  | 'materialUpdatedAt'
  | 'updatedAt'
> & {
  slug: string
  firstProposalTitle: string | null
}

interface CandidateListResult {
  data: CandidateListRow[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

interface CandidateStats {
  total: number
  byPosition: Record<string, number>
  byParty: Record<string, number>
  byState: Record<string, number>
}

function canonicalCandidateCte(): Prisma.Sql {
  return Prisma.sql`
    WITH ranked AS (
      SELECT
        c.*,
        COALESCE(
          NULLIF(c.slug, ''),
          trim(BOTH '-' FROM regexp_replace(
            immutable_unaccent(lower(concat_ws('-', c.name, c.party, c.state))),
            '[^a-z0-9]+', '-', 'g'
          ))
        ) AS "effectiveSlug",
        row_number() OVER (
          PARTITION BY
            CASE
              WHEN NULLIF(btrim(c."personKey"), '') IS NOT NULL
                THEN 'person-key:' || lower(btrim(c."personKey"))
              WHEN c."tseId" IS NOT NULL THEN 'tse:' || c."tseId"
              ELSE 'record:' || c.id
            END,
            c."electionYear"
          ORDER BY
            CASE
              WHEN c."isOfficial" THEN 4
              WHEN c."tseId" IS NOT NULL THEN 3
              WHEN lower(COALESCE(c."candidacyStatusSourceUrl", '')) LIKE 'https://%.tse.jus.br/%'
                OR lower(COALESCE(c."candidacyStatusSourceUrl", '')) LIKE 'https://tse.jus.br/%'
                OR lower(COALESCE(c."candidacyStatusSourceUrl", '')) ~ '^https://[^/]*tre-[a-z]{2}[.]jus[.]br(/|$)'
                THEN 2
              WHEN c."candidacyStatusSourceUrl" IS NOT NULL THEN 1
              ELSE 0
            END DESC,
            c."candidacyStatusVerifiedAt" DESC NULLS LAST,
            c."materialUpdatedAt" DESC NULLS LAST,
            CASE c.position::text
              WHEN 'PRESIDENTE' THEN 90
              WHEN 'GOVERNADOR' THEN 80
              WHEN 'SENADOR' THEN 70
              WHEN 'DEPUTADO_FEDERAL' THEN 60
              WHEN 'DEPUTADO_ESTADUAL' THEN 50
              WHEN 'PREFEITO' THEN 40
              WHEN 'VEREADOR' THEN 30
              WHEN 'VICE_PRESIDENTE' THEN 20
              WHEN 'VICE_GOVERNADOR' THEN 10
              ELSE 0
            END DESC,
            c."updatedAt" DESC,
            CASE c."candidacyStatus"
              WHEN 'deferido' THEN 90
              WHEN 'registro_solicitado' THEN 80
              WHEN 'escolhido_convencao' THEN 70
              WHEN 'pre_candidato' THEN 60
              WHEN 'indeferido' THEN 50
              WHEN 'substituido' THEN 40
              WHEN 'desistiu' THEN 40
              WHEN 'cancelado' THEN 30
              WHEN 'pedido_nao_conhecido' THEN 30
              WHEN 'cassado' THEN 30
              WHEN 'falecido' THEN 30
              WHEN 'status_nao_mapeado' THEN 20
              WHEN 'confirmado' THEN 30
              WHEN 'cotado' THEN 10
              ELSE 0
            END DESC,
            c.id ASC
        ) AS "identityRank"
      FROM "Candidate" c
      WHERE c."isPublished" = true
        AND c.position IN ('PRESIDENTE', 'GOVERNADOR', 'SENADOR')
    ),
    canonical AS (
      SELECT * FROM ranked WHERE "identityRank" = 1
    ),
    slug_counts AS (
      SELECT "effectiveSlug", count(*) AS "slugCount"
      FROM canonical
      GROUP BY "effectiveSlug"
    )
  `
}

export async function listCandidates(filters: CandidateFilters): Promise<CandidateListResult> {
  const { party, state, position, electionYear, search, page, limit } = filters
  const skip = (page - 1) * limit
  const readModel = getCandidateReadModel()
  const key = cacheKey.candidateList(`${readModel}:${JSON.stringify(filters)}`)

  return withCache(key, TTL.CANDIDATE_LIST, async () => {
    const cte = canonicalCandidateCte()
    const identityName = readModel === 'normalized'
      ? Prisma.sql`COALESCE(person.name, c.name)`
      : Prisma.sql`c.name`
    const identitySocialName = readModel === 'normalized'
      ? Prisma.sql`COALESCE(person."socialName", c."socialName", '')`
      : Prisma.sql`COALESCE(c."socialName", '')`
    const conditions: Prisma.Sql[] = [Prisma.sql`sc."slugCount" = 1`]

    if (electionYear) conditions.push(Prisma.sql`c."electionYear" = ${electionYear}`)
    if (party) conditions.push(Prisma.sql`c.party = ${party}`)
    if (state) conditions.push(Prisma.sql`c.state = ${state}`)
    if (position) conditions.push(Prisma.sql`c.position::text = ${position}`)
    if (search) {
      const pattern = `%${search}%`
      conditions.push(Prisma.sql`(
        immutable_unaccent(lower(${identityName})) LIKE immutable_unaccent(lower(${pattern}))
        OR immutable_unaccent(lower(${identitySocialName})) LIKE immutable_unaccent(lower(${pattern}))
        OR immutable_unaccent(lower(c.party)) LIKE immutable_unaccent(lower(${pattern}))
        OR lower(c.state) LIKE lower(${pattern})
      )`)
    }
    const whereClause = Prisma.join(conditions, ' AND ')

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<CandidateListRow[]>`
        ${cte}
        SELECT
          c.id, ${identityName} AS name,
          NULLIF(${identitySocialName}, '') AS "socialName",
          c.party, c.state, c.position, c."photoUrl", c."ballotNumber",
          c."isIncumbent", c."electionYear", c."isOfficial",
          c."officialStatus", c."dataSource", c."lastSyncedAt",
          c."personKey", c."tseId", c."effectiveSlug" AS slug,
          c."candidacyStatus", c."materialUpdatedAt", c."updatedAt",
          proposal.title AS "firstProposalTitle"
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        LEFT JOIN "Person" person ON person.id = c."personId"
        LEFT JOIN LATERAL (
          SELECT p.title
          FROM "Proposal" p
          WHERE p."candidateId" = c.id
            AND p."isPublished" = true
            AND p.url LIKE 'https://%'
            AND p.status <> 'DRAFT'::"ProposalStatus"
          ORDER BY p."proposedAt" DESC NULLS LAST, p."updatedAt" DESC
          LIMIT 1
        ) proposal ON true
        WHERE ${whereClause}
        ORDER BY c.position::text ASC, c.state ASC, name ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ total: number }>>`
        ${cte}
        SELECT count(*)::integer AS total
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        LEFT JOIN "Person" person ON person.id = c."personId"
        WHERE ${whereClause}
      `,
    ])
    const total = countRows[0]?.total ?? 0

    return {
      data: rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  })
}

const detailInclude = {
  person: true,
  proposals: {
    where: PUBLIC_PROPOSAL_WHERE,
    orderBy: PUBLIC_PROPOSAL_ORDER_BY,
    take: PUBLIC_PROPOSAL_LIMIT,
  },
  votingRecords: {
    where: PUBLIC_VOTING_RECORD_WHERE,
    orderBy: PUBLIC_VOTING_RECORD_ORDER_BY,
    take: PUBLIC_VOTING_RECORD_LIMIT,
  },
  assetDeclarations: {
    where: PUBLIC_ASSET_DECLARATION_WHERE,
    orderBy: PUBLIC_ASSET_DECLARATION_ORDER_BY,
    take: PUBLIC_ASSET_DECLARATION_LIMIT,
  },
  campaignFinancings: {
    where: PUBLIC_CAMPAIGN_FINANCING_WHERE,
    orderBy: PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
    take: PUBLIC_CAMPAIGN_FINANCING_LIMIT,
  },
} satisfies Prisma.CandidateInclude

type DetailedCandidate = Prisma.CandidateGetPayload<{ include: typeof detailInclude }>
type PresentedCandidate = Omit<
  DetailedCandidate,
  | 'person'
  | 'personId'
  | 'electionId'
  | 'officialStatusRaw'
  | 'isPublished'
  | 'sourceUrl'
  | 'syncRunId'
> & {
  slug: string
  votingRecords: DetailedCandidate['votingRecords']
}

async function presentCandidate(
  candidate: DetailedCandidate,
  slug: string,
  readModel: CandidateReadModel,
): Promise<PresentedCandidate> {
  let votingRecords = candidate.votingRecords
  if (readModel === 'normalized' && candidate.personId) {
    votingRecords = await prisma.votingRecord.findMany({
      where: {
        ...PUBLIC_VOTING_RECORD_WHERE,
        OR: [
          { candidateId: candidate.id },
          { personId: candidate.personId },
          { mandate: { personId: candidate.personId } },
        ],
      },
      orderBy: PUBLIC_VOTING_RECORD_ORDER_BY,
      take: PUBLIC_VOTING_RECORD_LIMIT,
    })
  }
  return { ...publicDetailFields(candidate, readModel), slug, votingRecords }
}

async function canonicalize(seed: DetailedCandidate): Promise<DetailedCandidate> {
  const identityWhere: Prisma.CandidateWhereInput = seed.personKey?.trim()
    ? {
        personKey: { equals: seed.personKey, mode: 'insensitive' },
        electionYear: seed.electionYear,
      }
    : seed.tseId
      ? { tseId: seed.tseId, electionYear: seed.electionYear }
      : { id: seed.id }
  const siblings = await prisma.candidate.findMany({
    where: { AND: [publicCandidateWhere(), identityWhere] },
    include: detailInclude,
  })
  const identityMatches = groupCandidateRecords(siblings).find((group) =>
    group.some((candidate) => candidate.id === seed.id),
  ) ?? []
  return chooseCanonicalCandidate(identityMatches.length > 0 ? identityMatches : [seed])
}

async function presentCanonicalCandidate(
  seed: DetailedCandidate,
  readModel: CandidateReadModel,
): Promise<PresentedCandidate> {
  const canonical = await canonicalize(seed)
  const canonicalIdentity = identityFields(canonical, readModel)
  const canonicalSlug = canonical.slug
    ?? makeSlug(canonicalIdentity.name, canonicalIdentity.party, canonicalIdentity.state)
  return presentCandidate(canonical, canonicalSlug, readModel)
}

export async function getCandidateBySlug(slug: string): Promise<PresentedCandidate | null> {
  const readModel = getCandidateReadModel()
  return withCache(
    cacheKey.candidateDetail(`${readModel}:${slug}`),
    TTL.CANDIDATE_DETAIL,
    async () => {
      const directMatches = await prisma.candidate.findMany({
        where: { slug, ...publicCandidateWhere() },
        include: detailInclude,
      })
      if (directMatches.length > 0) {
        const identityGroups = groupCandidateRecords(directMatches)
        if (identityGroups.length !== 1) return null
        return presentCanonicalCandidate(
          chooseCanonicalCandidate(identityGroups[0]),
          readModel,
        )
      }

      const alias = await prisma.candidateSlugAlias.findFirst({
        where: {
          slug,
          candidate: publicCandidateWhere(),
        },
        include: { candidate: { include: detailInclude } },
      })
      if (alias) return presentCanonicalCandidate(alias.candidate, readModel)

      // Fallback para slugs legados, derivados de nome/partido/UF. A identidade
      // é resolvida por uma projeção sem relações e só o registro vencedor
      // carrega propostas, votos, bens e financiamento: com o país inteiro
      // importado, aplicar `detailInclude` a todos os publicados custava
      // milhares de linhas por acesso — e um slug inexistente devolve `null`,
      // que por decisão do cache não é memorizado, então cada 404 repetia a
      // varredura. A projeção ainda traz os escalares que decidem identidade e
      // canonicidade; sem eles todo registro viraria um grupo isolado e o gate
      // de ambiguidade devolveria 404 para homônimos legítimos.
      const parsed = parseCandidateSlug(slug)
      if (!parsed) return null
      const identities = await prisma.candidate.findMany({
        where: {
          ...publicCandidateWhere(),
          state: { equals: parsed.state },
        },
        select: {
          id: true,
          name: true,
          party: true,
          state: true,
          position: true,
          isOfficial: true,
          tseId: true,
          personKey: true,
          electionYear: true,
          candidacyStatus: true,
          candidacyStatusSourceUrl: true,
          candidacyStatusVerifiedAt: true,
          materialUpdatedAt: true,
          updatedAt: true,
        },
      })
      const matches = identities.filter(
        (candidate) => makeSlug(candidate.name, candidate.party, candidate.state) === slug,
      )
      if (matches.length === 0) return null
      const identityGroups = groupCandidateRecords(matches)
      if (identityGroups.length !== 1) return null

      const winner = chooseCanonicalCandidate(identityGroups[0])
      const candidate = await prisma.candidate.findFirst({
        where: { id: winner.id, ...publicCandidateWhere() },
        include: detailInclude,
      })
      return candidate ? presentCanonicalCandidate(candidate, readModel) : null
    },
  )
}

export async function getCandidateById(id: string): Promise<PresentedCandidate | null> {
  const readModel = getCandidateReadModel()
  const candidate = await prisma.candidate.findFirst({
    where: { id, ...publicCandidateWhere() },
    include: detailInclude,
  })
  if (!candidate) return null
  return presentCanonicalCandidate(candidate, readModel)
}

export async function getCandidateStats(): Promise<CandidateStats> {
  const readModel = getCandidateReadModel()
  return withCache(cacheKey.stats(readModel), TTL.STATS, async () => {
    const cte = canonicalCandidateCte()
    const [totals, positions, parties, states] = await Promise.all([
      prisma.$queryRaw<Array<{ total: number }>>`
        ${cte}
        SELECT count(*)::integer AS total
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        WHERE c."electionYear" = 2026 AND sc."slugCount" = 1
      `,
      prisma.$queryRaw<Array<{ value: string; count: number }>>`
        ${cte}
        SELECT c.position::text AS value, count(*)::integer AS count
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        WHERE c."electionYear" = 2026 AND sc."slugCount" = 1
        GROUP BY c.position
        ORDER BY count DESC, value ASC
      `,
      prisma.$queryRaw<Array<{ value: string; count: number }>>`
        ${cte}
        SELECT c.party AS value, count(*)::integer AS count
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        WHERE c."electionYear" = 2026 AND sc."slugCount" = 1
        GROUP BY c.party
        ORDER BY count DESC, value ASC
      `,
      prisma.$queryRaw<Array<{ value: string; count: number }>>`
        ${cte}
        SELECT c.state AS value, count(*)::integer AS count
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        WHERE c."electionYear" = 2026 AND sc."slugCount" = 1
        GROUP BY c.state
        ORDER BY count DESC, value ASC
      `,
    ])

    const toRecord = (rows: Array<{ value: string; count: number }>) =>
      Object.fromEntries(rows.map((row) => [row.value, row.count]))

    return {
      total: totals[0]?.total ?? 0,
      byPosition: toRecord(positions),
      byParty: toRecord(parties),
      byState: toRecord(states),
    }
  })
}
