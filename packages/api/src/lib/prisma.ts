import { PrismaClient } from '@prisma/client'

/**
 * Cada `new PrismaClient()` abre o seu próprio pool de conexões — por padrão
 * `núcleos * 2 + 1` por instância. A API chegou a instanciar seis clientes em
 * módulos diferentes e sozinha esgotou o limite de conexões do papel no
 * PostgreSQL compartilhado, deixando os jobs de dados sem nenhuma conexão
 * disponível (`FATAL: too many connections for role`). Todo acesso ao banco
 * deve passar por esta instância única.
 */
export const prisma = new PrismaClient()
