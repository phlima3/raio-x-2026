/**
 * O padrão do Prisma dimensiona o pool em `núcleos * 2 + 1`, então a mesma
 * imagem passa a consumir mais conexões ao ser realocada para um contêiner
 * maior — enquanto o limite do papel no PostgreSQL compartilhado não acompanha
 * essa variação. Declarar o teto mantém o consumo previsível e deixa margem
 * para as migrations do `preStartCommand` e para os jobs de dados, que
 * competem pelo mesmo limite.
 */
const DEFAULT_CONNECTION_LIMIT = 5

export function connectionLimit(): number {
  const configured = Number(process.env.API_CONNECTION_LIMIT)
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
