import { PrismaClient, Prisma } from '@prisma/client'
import { CandidateFilters } from '../types/candidate'
import { withCache, cacheKey, TTL } from './cacheService'

const prisma = new PrismaClient()

// ── Slug helpers ──────────────────────────────────────────────────────────────

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

function parseSlug(slug: string): { namePart: string; state: string } | null {
  const parts = slug.split('-')
  if (parts.length < 3) return null
  const state = parts[parts.length - 1]
  const namePart = parts[0]
  return { namePart, state }
}

// ── List candidates ───────────────────────────────────────────────────────────

type CandidateRow = {
  id: string
  name: string
  socialName: string | null
  party: string
  state: string
  position: string
  photoUrl: string | null
  ballotNumber: number | null
  isIncumbent: boolean
  electionYear: number
  firstProposalTitle: string | null
}

export async function listCandidates(filters: CandidateFilters) {
  const { party, state, position, electionYear, search, page, limit } = filters
  const skip = (page - 1) * limit
  const key = cacheKey.candidateList(JSON.stringify(filters))

  return withCache(key, TTL.CANDIDATE_LIST, async () => {
    // When search is present, use raw SQL with unaccent for accent-insensitive matching
    // ("flavio" must find "Flávio"; Prisma's ILIKE is case-insensitive but not accent-insensitive)
    if (search) {
      const searchParam = `%${search}%`
      const conditions: Prisma.Sql[] = [
        Prisma.sql`(
          unaccent(lower(c.name)) LIKE unaccent(lower(${searchParam}))
          OR unaccent(lower(COALESCE(c."socialName", ''))) LIKE unaccent(lower(${searchParam}))
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
          SELECT COUNT(*) AS count FROM "Candidate" c WHERE ${whereClause}
        `,
        prisma.$queryRaw<CandidateRow[]>`
          SELECT c.id, c.name, c."socialName", c.party, c.state, c.position,
                 c."photoUrl", c."ballotNumber", c."isIncumbent", c."electionYear",
                 (SELECT p.title FROM "Proposal" p WHERE p."candidateId" = c.id ORDER BY p."proposedAt" DESC NULLS LAST LIMIT 1) AS "firstProposalTitle"
          FROM "Candidate" c
          WHERE ${whereClause}
          ORDER BY c.position ASC, c.state ASC, c.name ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
      ])

      const total = Number(countResult[0].count)
      return {
        data: rows.map((c) => ({ ...c, slug: makeSlug(c.name, c.party, c.state) })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      }
    }

    // No search: use ORM (supports Prisma type safety + index scans on exact filters)
    const where: Prisma.CandidateWhereInput = {
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
          name: true,
          socialName: true,
          party: true,
          state: true,
          position: true,
          photoUrl: true,
          ballotNumber: true,
          isIncumbent: true,
          electionYear: true,
          proposals: {
            take: 1,
            orderBy: { proposedAt: 'desc' as const },
            select: { title: true },
          },
        },
      }),
    ])

    return {
      data: candidates.map(({ proposals, ...c }) => ({
        ...c,
        slug: makeSlug(c.name, c.party, c.state),
        firstProposalTitle: proposals[0]?.title ?? null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  })
}

// ── Get candidate by slug ─────────────────────────────────────────────────────

export async function getCandidateBySlug(slug: string) {
  return withCache(cacheKey.candidateDetail(slug), TTL.CANDIDATE_DETAIL, async () => {
    // Try direct slug column lookup first (fast path)
    const bySlug = await prisma.candidate.findFirst({
      where: { slug },
      include: {
        proposals: { orderBy: { proposedAt: 'desc' }, take: 50 },
        votingRecords: { orderBy: { votedAt: 'desc' }, take: 100 },
        assetDeclarations: { orderBy: { year: 'desc' } },
        campaignFinancings: { orderBy: { year: 'desc' } },
      },
    })
    if (bySlug) return { ...bySlug, slug }

    // Fallback: filter by state then match slug in JS (handles accented names like "Flávio")
    const parsed = parseSlug(slug)
    const candidates = await prisma.candidate.findMany({
      where: parsed ? { state: { equals: parsed.state.toUpperCase() } } : {},
      include: {
        proposals: { orderBy: { proposedAt: 'desc' }, take: 50 },
        votingRecords: { orderBy: { votedAt: 'desc' }, take: 100 },
        assetDeclarations: { orderBy: { year: 'desc' } },
        campaignFinancings: { orderBy: { year: 'desc' } },
      },
    })

    const match = candidates.find((c) => makeSlug(c.name, c.party, c.state) === slug)
    if (!match) return null
    return { ...match, slug }
  })
}

// ── Get candidate by ID ───────────────────────────────────────────────────────

export async function getCandidateById(id: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      proposals: { orderBy: { proposedAt: 'desc' }, take: 50 },
      votingRecords: { orderBy: { votedAt: 'desc' }, take: 100 },
      assetDeclarations: { orderBy: { year: 'desc' } },
      campaignFinancings: { orderBy: { year: 'desc' } },
    },
  })
  if (!candidate) return null
  return { ...candidate, slug: makeSlug(candidate.name, candidate.party, candidate.state) }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getCandidateStats() {
  return withCache(cacheKey.stats(), TTL.STATS, async () => {
  const [byPosition, byParty, byState, total] = await Promise.all([
    prisma.candidate.groupBy({ by: ['position'], _count: { id: true } }),
    prisma.candidate.groupBy({ by: ['party'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
    prisma.candidate.groupBy({ by: ['state'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.candidate.count(),
  ])

  return {
    total,
    byPosition: Object.fromEntries(byPosition.map((r) => [r.position, r._count.id])),
    byParty: Object.fromEntries(byParty.map((r) => [r.party, r._count.id])),
    byState: Object.fromEntries(byState.map((r) => [r.state, r._count.id])),
  }
  })
}
