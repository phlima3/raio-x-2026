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

export async function listCandidates(filters: CandidateFilters) {
  const { party, state, position, electionYear, search, page, limit } = filters
  const skip = (page - 1) * limit
  const key = cacheKey.candidateList(JSON.stringify(filters))

  return withCache(key, TTL.CANDIDATE_LIST, async () => {
    const where: Prisma.CandidateWhereInput = {
      ...(party && { party }),
      ...(state && { state }),
      ...(position && { position }),
      ...(electionYear && { electionYear }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { socialName: { contains: search, mode: 'insensitive' } },
          { party: { contains: search, mode: 'insensitive' } },
        ],
      }),
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
        },
      }),
    ])

    return {
      data: candidates.map((c) => ({
        ...c,
        slug: makeSlug(c.name, c.party, c.state),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  })
}

// ── Get candidate by slug ─────────────────────────────────────────────────────

export async function getCandidateBySlug(slug: string) {
  return withCache(cacheKey.candidateDetail(slug), TTL.CANDIDATE_DETAIL, async () => {
    const parsed = parseSlug(slug)

    const candidates = await prisma.candidate.findMany({
      where: parsed
        ? { state: { equals: parsed.state.toUpperCase() }, name: { startsWith: parsed.namePart, mode: 'insensitive' } }
        : { name: { contains: slug, mode: 'insensitive' } },
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
