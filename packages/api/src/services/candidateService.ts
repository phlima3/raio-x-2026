import { PrismaClient, Prisma } from '@prisma/client'
import { CandidateFilters } from '../types/candidate'
import { withCache, cacheKey, TTL } from './cacheService'
import {
  chooseCanonicalCandidate,
  groupCandidateRecords,
  makeCandidateSlug,
  parseCandidateSlug,
} from '../domain/candidateIdentity'
import {
  PUBLIC_PROPOSAL_LIMIT,
  PUBLIC_PROPOSAL_ORDER_BY,
  PUBLIC_PROPOSAL_WHERE,
  PUBLIC_ASSET_DECLARATION_LIMIT,
  PUBLIC_ASSET_DECLARATION_ORDER_BY,
  PUBLIC_ASSET_DECLARATION_WHERE,
  PUBLIC_CAMPAIGN_FINANCING_LIMIT,
  PUBLIC_CAMPAIGN_FINANCING_ORDER_BY,
  PUBLIC_CAMPAIGN_FINANCING_WHERE,
  PUBLIC_VOTING_RECORD_LIMIT,
  PUBLIC_VOTING_RECORD_ORDER_BY,
  PUBLIC_VOTING_RECORD_WHERE,
} from '../domain/publicationPolicy'

const prisma = new PrismaClient()

// ── Slug helpers ──────────────────────────────────────────────────────────────

export function makeSlug(name: string, party: string, state: string): string {
  return makeCandidateSlug(name, party, state)
}

// ── List candidates ───────────────────────────────────────────────────────────

type CandidateListRow = {
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
  personKey: string | null
  tseId: string | null
  slug: string
  candidacyStatus: string | null
  materialUpdatedAt: Date | null
  updatedAt: Date
  firstProposalTitle: string | null
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
                THEN 'person:' || lower(btrim(c."personKey"))
              WHEN c."tseId" IS NOT NULL THEN 'tse:' || c."tseId"
              ELSE 'record:' || c.id
            END,
            c."electionYear"
          ORDER BY
            CASE
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

export async function listCandidates(filters: CandidateFilters) {
  const { party, state, position, electionYear, search, page, limit } = filters
  const skip = (page - 1) * limit
  const key = cacheKey.candidateList(JSON.stringify(filters))

  return withCache(key, TTL.CANDIDATE_LIST, async () => {
    // Canonicalization, collision blocking, filters and pagination all execute
    // in PostgreSQL. This keeps a homepage request for eight profiles from
    // hydrating the full election catalog and applies filters only after the
    // positive identity key has selected the canonical row.
    const cte = canonicalCandidateCte()
    const conditions: Prisma.Sql[] = [Prisma.sql`sc."slugCount" = 1`]
    if (electionYear) conditions.push(Prisma.sql`c."electionYear" = ${electionYear}`)
    if (party) conditions.push(Prisma.sql`c.party = ${party}`)
    if (state) conditions.push(Prisma.sql`c.state = ${state}`)
    if (position) conditions.push(Prisma.sql`c.position::text = ${position}`)
    if (search) {
      const pattern = `%${search}%`
      conditions.push(Prisma.sql`(
        immutable_unaccent(lower(c.name)) LIKE immutable_unaccent(lower(${pattern}))
        OR immutable_unaccent(lower(COALESCE(c."socialName", ''))) LIKE immutable_unaccent(lower(${pattern}))
        OR immutable_unaccent(lower(c.party)) LIKE immutable_unaccent(lower(${pattern}))
        OR lower(c.state) LIKE lower(${pattern})
      )`)
    }
    const whereClause = Prisma.join(conditions, ' AND ')

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<CandidateListRow[]>`
        ${cte}
        SELECT
          c.id, c.name, c."socialName", c.party, c.state, c.position,
          c."photoUrl", c."ballotNumber", c."isIncumbent", c."electionYear",
          c."personKey", c."tseId", c."effectiveSlug" AS slug,
          c."candidacyStatus", c."materialUpdatedAt", c."updatedAt",
          proposal.title AS "firstProposalTitle"
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
        LEFT JOIN LATERAL (
          SELECT p.title
          FROM "Proposal" p
          WHERE p."candidateId" = c.id
            AND p.url LIKE 'https://%'
            AND p.status <> 'DRAFT'::"ProposalStatus"
          ORDER BY p."proposedAt" DESC NULLS LAST, p."updatedAt" DESC
          LIMIT 1
        ) proposal ON true
        WHERE ${whereClause}
        ORDER BY c.position::text ASC, c.state ASC, c.name ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ total: number }>>`
        ${cte}
        SELECT count(*)::integer AS total
        FROM canonical c
        JOIN slug_counts sc ON sc."effectiveSlug" = c."effectiveSlug"
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

// ── Get candidate by slug ─────────────────────────────────────────────────────

export async function getCandidateBySlug(slug: string) {
  return withCache(cacheKey.candidateDetail(slug), TTL.CANDIDATE_DETAIL, async () => {
    const include = {
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

    type DetailedCandidate = Prisma.CandidateGetPayload<{ include: typeof include }>

    const canonicalize = async (seed: DetailedCandidate) => {
      const siblings = await prisma.candidate.findMany({
        where: seed.personKey?.trim()
          ? {
              personKey: { equals: seed.personKey, mode: 'insensitive' },
              electionYear: seed.electionYear,
            }
          : seed.tseId
            ? { tseId: seed.tseId, electionYear: seed.electionYear }
            : { id: seed.id },
        include,
      })
      const identityMatches = groupCandidateRecords(siblings).find((group) =>
        group.some((candidate) => candidate.id === seed.id),
      ) ?? []
      return chooseCanonicalCandidate(identityMatches.length > 0 ? identityMatches : [seed])
    }

    // Multiple legacy office rows can share an effective profile slug. Resolve
    // them deterministically instead of relying on database insertion order.
    const directMatches = await prisma.candidate.findMany({
      where: { slug },
      include,
    })
    if (directMatches.length > 0) {
      const identityGroups = groupCandidateRecords(directMatches)
      // A shared slug cannot safely identify two people. An explicit unique
      // alias or corrected canonical slug must be curated before either profile
      // is served at this path.
      if (identityGroups.length !== 1) return null
      const canonical = await canonicalize(chooseCanonicalCandidate(identityGroups[0]))
      return {
        ...canonical,
        slug: canonical.slug ?? makeSlug(canonical.name, canonical.party, canonical.state),
      }
    }

    const alias = await prisma.candidateSlugAlias.findUnique({
      where: { slug },
      include: { candidate: { include } },
    })
    if (alias) {
      const canonical = await canonicalize(alias.candidate)
      return {
        ...canonical,
        slug: canonical.slug ?? makeSlug(canonical.name, canonical.party, canonical.state),
      }
    }

    // Fallback: filter by state then match slug in JS (handles accented names like "Flávio")
    const parsed = parseCandidateSlug(slug)
    if (!parsed) return null
    const candidates = await prisma.candidate.findMany({
      where: { state: { equals: parsed.state } },
      include,
    })

    const matches = candidates.filter(
      (candidate) => makeSlug(candidate.name, candidate.party, candidate.state) === slug,
    )
    if (matches.length === 0) return null
    const identityGroups = groupCandidateRecords(matches)
    if (identityGroups.length !== 1) return null
    const canonical = await canonicalize(chooseCanonicalCandidate(identityGroups[0]))
    return {
      ...canonical,
      slug: canonical.slug ?? makeSlug(canonical.name, canonical.party, canonical.state),
    }
  })
}

// ── Get candidate by ID ───────────────────────────────────────────────────────

export async function getCandidateById(id: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
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
    },
  })
  if (!candidate) return null
  return {
    ...candidate,
    slug: candidate.slug ?? makeSlug(candidate.name, candidate.party, candidate.state),
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getCandidateStats() {
  return withCache(cacheKey.stats(), TTL.STATS, async () => {
    const cte = canonicalCandidateCte()
    const [totals, positions, parties, states] = await Promise.all([
      prisma.$queryRaw<Array<{ total: number }>>`
        ${cte}
        SELECT count(*)::integer AS total
        FROM canonical
        WHERE "electionYear" = 2026
      `,
      prisma.$queryRaw<Array<{ value: string; count: number }>>`
        ${cte}
        SELECT position::text AS value, count(*)::integer AS count
        FROM canonical
        WHERE "electionYear" = 2026
        GROUP BY position
        ORDER BY count DESC, value ASC
      `,
      prisma.$queryRaw<Array<{ value: string; count: number }>>`
        ${cte}
        SELECT party AS value, count(*)::integer AS count
        FROM canonical
        WHERE "electionYear" = 2026
        GROUP BY party
        ORDER BY count DESC, value ASC
      `,
      prisma.$queryRaw<Array<{ value: string; count: number }>>`
        ${cte}
        SELECT state AS value, count(*)::integer AS count
        FROM canonical
        WHERE "electionYear" = 2026
        GROUP BY state
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
