import 'dotenv/config'
import { createHash } from 'node:crypto'
import {
  Position,
  PrismaClient,
  ProposalOrigin,
  ProposalStatus,
  type Candidate,
} from '@prisma/client'

import {
  CANDIDATE_ALIASES,
  PRESIDENTIAL_PERSON_KEYS,
  PRESIDENTIAL_SOURCES,
} from '../data/presidentialSources'
import {
  isElectoralJusticeSource,
  shouldAcceptIncomingStatus,
} from '../domain/candidacyStatus'
import {
  extractPresidenciaveis,
  extractProposalsFromNews,
  type ExtractedCandidate,
} from '../processors/presidentialExtractor'
import { fetchAllSources, type FetchedArticle } from '../sources/presidentialNews'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { closeBrowser } from '../utils/playwright'
import { revalidateCandidatePages } from '../utils/revalidateWeb'

export { isElectoralJusticeSource, shouldAcceptIncomingStatus }

const prisma = new PrismaClient()

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalName(name: string): string {
  return CANDIDATE_ALIASES[normalizeName(name)] ?? name
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

function effectiveSlug(candidate: Pick<Candidate, 'slug' | 'name' | 'party' | 'state'>): string {
  return candidate.slug
    ?? `${slugify(candidate.name)}-${slugify(candidate.party)}-${slugify(candidate.state)}`
}

export function namesMatch(a: string, b: string): boolean {
  const normalizedA = normalizeName(canonicalName(a))
  const normalizedB = normalizeName(canonicalName(b))
  if (normalizedA === normalizedB) return true
  if (normalizedA.length >= 8 && normalizedB.includes(normalizedA)) return true
  if (normalizedB.length >= 8 && normalizedA.includes(normalizedB)) return true
  const tokensA = normalizedA.split(' ').filter((token) => token.length > 1)
  const tokensB = normalizedB.split(' ').filter((token) => token.length > 1)
  const [shorter, longer] = tokensA.length <= tokensB.length
    ? [tokensA, tokensB]
    : [tokensB, tokensA]
  return shorter.length >= 2 && shorter.every((token) => longer.includes(token))
}

export function curatedPersonKeyForName(name: string): string | undefined {
  return PRESIDENTIAL_PERSON_KEYS[normalizeName(canonicalName(name))]
}

export function findCuratedCandidate<
  T extends { personKey: string | null },
>(name: string, candidates: T[]): T | undefined {
  const personKey = curatedPersonKeyForName(name)
  if (!personKey) return undefined
  const matches = candidates.filter(
    (candidate) => candidate.personKey?.trim().toLowerCase() === personKey,
  )
  return matches.length === 1 ? matches[0] : undefined
}

interface MergedCandidate extends ExtractedCandidate {
  sources: string[]
  statusSourceUrl?: string
}

export function mergeExtractedCandidates(
  perSource: { sourceId: string; sourceUrl?: string; candidates: ExtractedCandidate[] }[],
): MergedCandidate[] {
  const merged: MergedCandidate[] = []

  for (const { sourceId, sourceUrl, candidates } of perSource) {
    for (const extracted of candidates) {
      const existing = merged.find((candidate) => namesMatch(candidate.name, extracted.name))
      if (!existing) {
        merged.push({
          ...extracted,
          name: canonicalName(extracted.name),
          sources: [sourceId],
          statusSourceUrl: sourceUrl,
        })
        continue
      }

      existing.sources.push(sourceId)
      if (
        shouldAcceptIncomingStatus({
          currentStatus: existing.status,
          currentSourceUrl: existing.statusSourceUrl,
          incomingStatus: extracted.status,
          incomingSourceUrl: sourceUrl,
        }) &&
        (extracted.status !== existing.status ||
          isElectoralJusticeSource(sourceUrl) ||
          !isElectoralJusticeSource(existing.statusSourceUrl))
      ) {
        existing.status = extracted.status
        existing.statusSourceUrl = sourceUrl
      }
      existing.party ??= extracted.party
      existing.currentRole ??= extracted.currentRole
      existing.homeState ??= extracted.homeState
      existing.pollFirstRoundPct ??= extracted.pollFirstRoundPct
      if (canonicalName(extracted.name).length > existing.name.length) {
        existing.name = canonicalName(extracted.name)
      }
    }
  }

  return merged
}

async function enrichExistingPresidenciaveis(merged: MergedCandidate[]): Promise<string[]> {
  const dbCandidates = await prisma.candidate.findMany({
    where: {
      position: Position.PRESIDENTE,
      electionYear: 2026,
      isPublished: true,
    },
  })
  const touchedSlugs = new Set<string>()
  let updated = 0

  for (const extracted of merged) {
    const personKey = curatedPersonKeyForName(extracted.name)
    const existing = findCuratedCandidate(extracted.name, dbCandidates)
    if (!personKey || !existing) {
      logger.info(
        `[presidenciaveis] Contexto ignorado para ${extracted.name}: identidade curada não corresponde a uma candidatura publicada`,
      )
      continue
    }

    const verifiedAt = new Date()
    const acceptsStatus = shouldAcceptIncomingStatus({
      currentStatus: existing.candidacyStatus,
      currentSourceUrl: existing.candidacyStatusSourceUrl,
      incomingStatus: extracted.status,
      incomingSourceUrl: extracted.statusSourceUrl,
    })
    const identityChanged = existing.personKey?.trim().toLowerCase() !== personKey
    if (!acceptsStatus && !identityChanged) continue

    const statusChanged = acceptsStatus && existing.candidacyStatus !== extracted.status
    await prisma.candidate.update({
      where: { id: existing.id },
      data: {
        ...(identityChanged ? { personKey } : {}),
        ...(acceptsStatus
          ? {
              candidacyStatus: extracted.status,
              candidacyStatusSourceUrl: extracted.statusSourceUrl ?? null,
              candidacyStatusVerifiedAt: verifiedAt,
            }
          : {}),
        ...(statusChanged || identityChanged ? { materialUpdatedAt: verifiedAt } : {}),
      },
    })
    touchedSlugs.add(effectiveSlug(existing))
    updated += 1
  }

  logger.info(
    `[presidenciaveis] Contexto atualizado em ${updated} candidaturas existentes; 0 criadas`,
  )
  return [...touchedSlugs]
}

const THEME_LABELS: Record<string, string> = {
  economia: 'Economia',
  saude: 'Saúde',
  educacao: 'Educação',
  seguranca: 'Segurança',
  meioambiente: 'Meio Ambiente',
  tecnologia: 'Tecnologia',
  politicaexterna: 'Política Externa',
  outros: 'Outros',
}

async function saveProposalsFromArticles(articles: FetchedArticle[]): Promise<void> {
  const dbCandidates = await prisma.candidate.findMany({
    where: {
      position: Position.PRESIDENTE,
      electionYear: 2026,
      isPublished: true,
    },
  })
  let saved = 0
  let unmatched = 0
  let failed = 0

  for (const article of articles) {
    const proposals = await extractProposalsFromNews(article.text)
    logger.info(`[presidenciaveis] ${article.source.id}: ${proposals.length} propostas extraídas`)

    for (const proposal of proposals) {
      const candidate = findCuratedCandidate(proposal.candidateName, dbCandidates)
      if (!candidate) {
        unmatched += 1
        logger.warn(
          `[presidenciaveis] Proposta sem identidade curada correspondente: "${proposal.candidateName}"`,
        )
        continue
      }

      const hash = createHash('sha1').update(proposal.proposal).digest('hex').slice(0, 10)
      const externalId = `news_${candidate.id}_${proposal.theme}_${hash}`

      try {
        const existing = await prisma.proposal.findUnique({
          where: { externalId },
          select: { reviewedAt: true, candidateId: true },
        })
        if (existing?.reviewedAt) {
          saved += 1
          continue
        }
        if (existing && existing.candidateId !== candidate.id) {
          throw new Error(`External id ${externalId} pertence a outra candidatura`)
        }

        await prisma.proposal.upsert({
          where: { externalId },
          update: {
            title: `${THEME_LABELS[proposal.theme]} — declaração na imprensa`,
            description: proposal.proposal,
            category: THEME_LABELS[proposal.theme],
            tags: [proposal.theme, 'news', article.source.id],
            status: ProposalStatus.DRAFT,
            isPublished: false,
            origin: ProposalOrigin.AI_EXTRACTION,
            url: article.source.url,
          },
          create: {
            externalId,
            source: 'news',
            title: `${THEME_LABELS[proposal.theme]} — declaração na imprensa`,
            description: proposal.proposal,
            category: THEME_LABELS[proposal.theme],
            tags: [proposal.theme, 'news', article.source.id],
            status: ProposalStatus.DRAFT,
            isPublished: false,
            origin: ProposalOrigin.AI_EXTRACTION,
            url: article.source.url,
            candidateId: candidate.id,
          },
        })
        saved += 1
      } catch (error) {
        failed += 1
        logger.error(
          `[presidenciaveis] Falha ao salvar proposta ${externalId}`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  }

  logger.info(
    `[presidenciaveis] Propostas: ${saved} salvas, ${unmatched} sem candidato correspondente`,
  )
  if (failed > 0) throw new Error(`[presidenciaveis] ${failed} proposal write(s) failed`)
}

export async function runSyncPresidenciaveis(
  mode: 'all' | 'candidates' | 'proposals' = 'all',
): Promise<void> {
  logger.info(
    `[presidenciaveis] Iniciando sync (mode=${mode}) — ${PRESIDENTIAL_SOURCES.length} fontes`,
  )

  const articles = await fetchAllSources(PRESIDENTIAL_SOURCES)
  if (articles.length === 0) {
    throw new Error('[presidenciaveis] Nenhuma fonte pôde ser baixada')
  }

  const touchedSlugs = new Set<string>()
  if (mode !== 'proposals') {
    const perSource: Array<{
      sourceId: string
      sourceUrl?: string
      candidates: ExtractedCandidate[]
    }> = []
    for (const article of articles.filter((item) => item.source.kind !== 'news_hub')) {
      const candidates = await extractPresidenciaveis(article.text)
      logger.info(
        `[presidenciaveis] ${article.source.id}: ${candidates.length} presidenciáveis extraídos`,
      )
      perSource.push({
        sourceId: article.source.id,
        sourceUrl: article.source.url,
        candidates,
      })
    }

    const merged = mergeExtractedCandidates(perSource)
    logger.info(`[presidenciaveis] ${merged.length} presidenciáveis únicos após merge`)
    for (const slug of await enrichExistingPresidenciaveis(merged)) touchedSlugs.add(slug)
  }

  if (mode !== 'candidates') await saveProposalsFromArticles(articles)

  if (touchedSlugs.size > 0) {
    await invalidateApiCandidateCaches()
    await revalidateCandidatePages([...touchedSlugs])
  }

  logger.info('[presidenciaveis] Sync concluído')
}

if (require.main === module) {
  const argument = process.argv[2]
  const mode = argument === 'candidates' || argument === 'proposals' ? argument : 'all'

  runSyncPresidenciaveis(mode)
    .catch((error) => {
      logger.error('[presidenciaveis] Fatal error', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await closeBrowser()
      await prisma.$disconnect()
    })
}
