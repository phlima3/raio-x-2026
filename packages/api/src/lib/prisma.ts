import { PrismaClient } from '@prisma/client'

import { boundedDatabaseUrl } from './databaseUrl'

/**
 * Cada `new PrismaClient()` abre o seu próprio pool de conexões. A API chegou
 * a instanciar seis clientes em módulos diferentes e sozinha esgotou o limite
 * de conexões do papel no PostgreSQL compartilhado, deixando os jobs de dados
 * — e, num deploy, a própria migration do `preStartCommand` — sem nenhuma
 * conexão disponível (`FATAL: too many connections for role`). Todo acesso ao
 * banco deve passar por esta instância única, cujo pool tem teto explícito.
 */
function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) return new PrismaClient()
  return new PrismaClient({ datasources: { db: { url: boundedDatabaseUrl(url) } } })
}

export const prisma = createPrismaClient()
