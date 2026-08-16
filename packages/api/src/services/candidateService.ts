import {
  Position,
  Prisma,
  PrismaClient,
  type Candidate,
  type Person,
} from '@prisma/client'

import type { CandidateFilters } from '../types/candidate'
import { cacheKey, TTL, withCache } from './cacheService'

const prisma = new PrismaClient()

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

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function makeSlug(name: string, party: string, state: string): string {
  return `${slugify(name)}-${slugify(party)}-${slugify(state)}`
}

function parseLegacySlug(slug: string): { state: string } | null {
  const parts = slug.split('-')
  if (parts.length < 3) return null
  const state = parts[parts.length - 1]
  return state.length === 2 ? { state } : null
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

type CandidateRow = Pick<
  Candidate,
  | 'id'
  | 'slug'
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
> & { firstProposalTitle: string | null }

export async function listCandidates(filters: CandidateFilters) {
  const { party, state, position, electionYear, search, page, limit } = filters
  const skip = (page - 1) * limit
  const readModel = getCandidateReadModel()
  const key = cacheKey.candidateList(`${readModel}:${JSON.stringify(filters)}`)

  return withCache(key, TTL.CANDIDATE_LIST, async () => {
    if (search) {
      const searchParam = `%${search}%`
      const identityName = readModel === 'normalized'
        ? Prisma.sql`COALESCE(person.name, c.name)`
        : Prisma.sql`c.name`
      const identitySocialName = readModel === 'normalized'
        ? Prisma.sql`COALESCE(person."socialName", c."socialName", '')`
        : Prisma.sql`COALESCE(c."socialName", '')`
      const conditions: Prisma.Sql[] = [
        Prisma.sql`c."isPublished" = true`,
        Prisma.sql`c.position IN ('PRESIDENTE', 'GOVERNADOR', 'SENADOR')`,
        Prisma.sql`(
          unaccent(lower(${identityName})) LIKE unaccent(lower(${searchParam}))
          OR unaccent(lower(${identitySocialName})) LIKE unaccent(lower(${searchParam}))
          OR unaccent(lower(c.party)) LIKE unaccent(lower(${searchParam}))
        )`,
      ]
      if (party) conditions.push(Prisma.sql`c.party = ${party}`)
      if (state) conditions.push(Prisma.sql`c.state = ${state}`)
      if (position) conditions.push(Prisma.sql`c.position = ${position}`)
      if (electionYear) conditions.push(Prisma.sql`c."electionYear" = ${electionYear}`)
      const whereClause = Prisma.join(conditions, ' AND ')

      const [countResult, rows] = await Promise.all([
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) AS count
          FROM "Candidate" c
          LEFT JOIN "Person" person ON person.id = c."personId"
          WHERE ${whereClause}
        `,
        prisma.$queryRaw<CandidateRow[]>`
          SELECT c.id, c.slug, ${identityName} AS name,
                 NULLIF(${identitySocialName}, '') AS "socialName",
                 c.party, c.state, c.position, c."photoUrl", c."ballotNumber",
                 c."isIncumbent", c."electionYear", c."isOfficial",
                 c."officialStatus", c."dataSource", c."lastSyncedAt",
                 (SELECT p.title FROM "Proposal" p
                  WHERE p."candidateId" = c.id AND p."isPublished" = true
                  ORDER BY p."proposedAt" DESC NULLS LAST LIMIT 1) AS "firstProposalTitle"
          FROM "Candidate" c
          LEFT JOIN "Person" person ON person.id = c."personId"
          WHERE ${whereClause}
          ORDER BY c.position ASC, c.state ASC, name ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
      ])

      const total = Number(countResult[0]?.count ?? 0)
      return {
        data: rows.map((candidate) => ({
          ...candidate,
          slug: candidate.slug ?? makeSlug(candidate.name, candidate.party, candidate.state),
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      }
    }

    const where: Prisma.CandidateWhereInput = {
      ...publicCandidateWhere(),
      ...(party && { party }),
      ...(state && { state }),
      ...(position && { position }),
      ...(electionYear && { electionYear }),
    }
    const [total, candidates] = await Promise.all([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ position: 'asc' }, { state: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          socialName: true,
          party: true,
          state: true,
          position: true,
          photoUrl: true,
          ballotNumber: true,
          isIncumbent: true,
          electionYear: true,
          isOfficial: true,
          officialStatus: true,
          dataSource: true,
          lastSyncedAt: true,
          person: true,
          proposals: {
            where: { isPublished: true },
            take: 1,
            orderBy: { proposedAt: 'desc' },
            select: { title: true },
          },
        },
      }),
    ])

    return {
      data: candidates.map(({ proposals, ...candidate }) => {
        const identity = identityFields(candidate, readModel)
        return {
          ...identity,
          slug: identity.slug ?? makeSlug(identity.name, identity.party, identity.state),
          firstProposalTitle: proposals[0]?.title ?? null,
        }
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  })
}

const detailInclude = {
  person: true,
  proposals: {
    where: { isPublished: true },
    orderBy: { proposedAt: 'desc' as const },
    take: 50,
  },
  votingRecords: { orderBy: { votedAt: 'desc' as const }, take: 100 },
  assetDeclarations: { orderBy: { year: 'desc' as const } },
  campaignFinancings: { orderBy: { year: 'desc' as const } },
} satisfies Prisma.CandidateInclude

async function presentCandidate<
  T extends Candidate & {
    person: Person | null
    votingRecords: unknown[]
  },
>(candidate: T, slug: string, readModel: CandidateReadModel) {
  let votingRecords = candidate.votingRecords
  if (readModel === 'normalized' && candidate.personId) {
    votingRecords = await prisma.votingRecord.findMany({
      where: {
        OR: [
          { candidateId: candidate.id },
          { personId: candidate.personId },
          { mandate: { personId: candidate.personId } },
        ],
      },
      orderBy: { votedAt: 'desc' },
      take: 100,
    })
  }
  return { ...publicDetailFields(candidate, readModel), slug, votingRecords }
}

export async function getCandidateBySlug(slug: string) {
  const readModel = getCandidateReadModel()
  return withCache(
    cacheKey.candidateDetail(`${readModel}:${slug}`),
    TTL.CANDIDATE_DETAIL,
    async () => {
      const bySlug = await prisma.candidate.findFirst({
        where: { slug, ...publicCandidateWhere() },
        include: detailInclude,
      })
      if (bySlug) return presentCandidate(bySlug, slug, readModel)

      // Fallback para slugs legados, derivados de nome/partido/UF. A identidade
      // é resolvida com uma projeção enxuta e só o registro vencedor carrega
      // propostas, votos, bens e financiamento: com o país inteiro importado,
      // aplicar `detailInclude` a todos os publicados custava milhares de
      // linhas por acesso — e um slug inexistente devolve `null`, que por
      // decisão do cache não é memorizado, então cada 404 repetia a varredura.
      const parsed = parseLegacySlug(slug)
      const identities = await prisma.candidate.findMany({
        where: {
          ...publicCandidateWhere(),
          ...(parsed && { state: parsed.state.toUpperCase() }),
        },
        select: { id: true, name: true, party: true, state: true },
      })
      const match = identities.find(
        (candidate) => makeSlug(candidate.name, candidate.party, candidate.state) === slug,
      )
      if (!match) return null

      const candidate = await prisma.candidate.findFirst({
        where: { id: match.id, ...publicCandidateWhere() },
        include: detailInclude,
      })
      return candidate ? presentCandidate(candidate, slug, readModel) : null
    },
  )
}

export async function getCandidateById(id: string) {
  const readModel = getCandidateReadModel()
  const candidate = await prisma.candidate.findFirst({
    where: { id, ...publicCandidateWhere() },
    include: detailInclude,
  })
  if (!candidate) return null
  const slug = candidate.slug ?? makeSlug(candidate.name, candidate.party, candidate.state)
  return presentCandidate(candidate, slug, readModel)
}

export async function getCandidateStats() {
  const readModel = getCandidateReadModel()
  return withCache(cacheKey.stats(readModel), TTL.STATS, async () => {
    const where = publicCandidateWhere()
    const [byPosition, byParty, byState, total] = await Promise.all([
      prisma.candidate.groupBy({ by: ['position'], where, _count: { id: true } }),
      prisma.candidate.groupBy({
        by: ['party'], where, _count: { id: true },
        orderBy: { _count: { id: 'desc' } }, take: 10,
      }),
      prisma.candidate.groupBy({
        by: ['state'], where, _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.candidate.count({ where }),
    ])
    return {
      total,
      byPosition: Object.fromEntries(byPosition.map((row) => [row.position, row._count.id])),
      byParty: Object.fromEntries(byParty.map((row) => [row.party, row._count.id])),
      byState: Object.fromEntries(byState.map((row) => [row.state, row._count.id])),
    }
  })
}
