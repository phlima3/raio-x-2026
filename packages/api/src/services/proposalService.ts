import { PrismaClient, Prisma } from '@prisma/client'
import { ProposalFilters } from '../types/proposal'
import { withCache, cacheKey, TTL } from './cacheService'

const prisma = new PrismaClient()

// ── List proposals ────────────────────────────────────────────────────────────

export async function listProposals(filters: ProposalFilters) {
  const { candidateId, category, status, source, search, page, limit } = filters
  const skip = (page - 1) * limit

  const where: Prisma.ProposalWhereInput = {
    ...(candidateId && { candidateId }),
    ...(category && { category: { contains: category, mode: 'insensitive' } }),
    ...(status && { status }),
    ...(source && { source }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [total, proposals] = await Promise.all([
    prisma.proposal.count({ where }),
    prisma.proposal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { proposedAt: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        source: true,
        tags: true,
        proposedAt: true,
        url: true,
        candidateId: true,
      },
    }),
  ])

  return {
    data: proposals,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

// ── Get proposal by ID ────────────────────────────────────────────────────────

export async function getProposalById(id: string) {
  return prisma.proposal.findUnique({
    where: { id },
    include: {
      candidate: {
        select: { id: true, name: true, party: true, state: true, position: true },
      },
    },
  })
}

// ── Get proposals by candidate ────────────────────────────────────────────────

export async function getProposalsByCandidate(candidateId: string) {
  return withCache(cacheKey.candidateProposals(candidateId), TTL.PROPOSALS, async () => {
    const proposals = await prisma.proposal.findMany({
      where: { candidateId },
      orderBy: [{ category: 'asc' }, { proposedAt: 'desc' }],
    })

    const grouped: Record<string, typeof proposals> = {}
    for (const p of proposals) {
      const key = p.category ?? 'Outros'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(p)
    }

    return grouped
  })
}

// ── Get categories ────────────────────────────────────────────────────────────

export async function getProposalCategories() {
  return withCache(cacheKey.categories(), TTL.CATEGORIES, async () => {
    const rows = await prisma.proposal.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      where: { category: { not: null } },
    })

    return rows.map((r) => ({ category: r.category, count: r._count.id }))
  })
}
