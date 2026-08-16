import { PrismaClient } from '@prisma/client'

/**
 * Por padrão o Prisma dimensiona o pool em `núcleos * 2 + 1` conexões, o que em
 * um runner de quatro núcleos reserva nove conexões para um job que processa
 * lotes sequencialmente e não ganha nada com paralelismo de conexão. No
 * PostgreSQL compartilhado da Veloz o papel tem um teto baixo, e um job de
 * dados que reserva o pool inteiro compete com a API pelo mesmo limite.
 */
const DEFAULT_CONNECTION_LIMIT = 3

function connectionLimit(): number {
  const configured = Number(process.env.SCRAPER_CONNECTION_LIMIT)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_CONNECTION_LIMIT
}

/** Mantém um `connection_limit` já presente na URL: o operador tem a palavra final. */
export function boundedDatabaseUrl(rawUrl: string, limit = connectionLimit()): string {
  try {
    const url = new URL(rawUrl)
    if (url.searchParams.has('connection_limit')) return rawUrl
    url.searchParams.set('connection_limit', String(limit))
    return url.toString()
  } catch {
    return rawUrl
  }
}

export function createScraperPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) return new PrismaClient()
  return new PrismaClient({ datasources: { db: { url: boundedDatabaseUrl(url) } } })
}
