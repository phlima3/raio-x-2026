import { Prisma, PrismaClient } from '@prisma/client'

import { PUBLIC_PROPOSAL_WHERE } from '../domain/publicationPolicy'
import type { ProposalFilters } from '../types/proposal'
import { cacheKey, TTL, withCache } from './cacheService'
import { publicCandidateWhere } from './candidateService'

const prisma = new PrismaClient()

export async function listProposals(filters: ProposalFilters) {
  const { candidateId, category, status, source, search, page, limit } = filters
  const skip = (page - 1) * limit

  const requestedWhere: Prisma.ProposalWhereInput = {
    candidate: publicCandidateWhere(),
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
  const where: Prisma.ProposalWhereInput = {
    AND: [PUBLIC_PROPOSAL_WHERE, requestedWhere],
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

export async function getProposalById(id: string) {
  return prisma.proposal.findFirst({
    where: {
      AND: [{ id, candidate: publicCandidateWhere() }, PUBLIC_PROPOSAL_WHERE],
    },
    include: {
      candidate: {
        select: { id: true, name: true, party: true, state: true, position: true },
      },
    },
  })
}

export async function getProposalsByCandidate(candidateId: string) {
  return withCache(cacheKey.candidateProposals(candidateId), TTL.PROPOSALS, async () => {
    const proposals = await prisma.proposal.findMany({
      where: {
        AND: [
          { candidateId, candidate: publicCandidateWhere() },
          PUBLIC_PROPOSAL_WHERE,
        ],
      },
      orderBy: [{ category: 'asc' }, { proposedAt: 'desc' }],
    })

    const grouped: Record<string, typeof proposals> = {}
    for (const proposal of proposals) {
      const key = proposal.category ?? 'Outros'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(proposal)
    }

    return grouped
  })
}

export async function getProposalCategories() {
  return withCache(cacheKey.categories(), TTL.CATEGORIES, async () => {
    const rows = await prisma.proposal.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      where: {
        AND: [
          { category: { not: null }, candidate: publicCandidateWhere() },
          PUBLIC_PROPOSAL_WHERE,
        ],
      },
    })

    return rows.map((row) => ({ category: row.category, count: row._count.id }))
  })
}
