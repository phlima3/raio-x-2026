export {}

const apiOrigin = (process.env.SEO_API_ORIGIN ?? 'https://api.raio-x-2026.com.br').replace(/\/$/, '')
const strict = process.argv.includes('--strict')
const full = process.argv.includes('--full')

interface ReportItem {
  slug: string
  name: string
  position: string
  candidacyStatus: string | null
  indexable: boolean
  substantiveModules: string[]
  blockers: string[]
  warnings: string[]
}

/**
 * Cada bloqueio classificado por *quem resolve*, não por gravidade.
 *
 * Contar bloqueios só diz o tamanho do problema; o que decide a ordem de
 * trabalho é saber se a fila é de backfill de campo ou de redação humana. Uma
 * ficha presa em `credito_de_imagem_ausente` volta ao índice com um UPDATE; uma
 * presa em `introducao_insuficiente` custa um texto revisado por pessoa. Somar
 * as duas numa lista única esconde justamente a decisão.
 *
 * `aguardando` é a terceira categoria e não é dívida: a candidatura ainda não
 * tem situação eleitoral que qualifique. A ficha está fora do índice porque
 * deve estar.
 */
type Track = 'dado' | 'editorial' | 'aguardando' | 'desconhecida'

const BLOCKER_TRACK: Record<string, Track | undefined> = {
  identidade_incompleta: 'dado',
  identidade_nao_confirmada: 'dado',
  vice_incompleto: 'dado',
  status_sem_fonte: 'dado',
  status_formal_sem_fonte_oficial: 'dado',
  status_sem_data_verificacao: 'dado',
  trajetoria_sem_fonte: 'dado',
  atualizacao_material_ausente: 'dado',
  imagem_insegura: 'dado',
  credito_de_imagem_ausente: 'dado',

  colisao_slug: 'editorial',
  introducao_insuficiente: 'editorial',
  menos_de_tres_modulos: 'editorial',
  sem_modulo_substantivo: 'editorial',
  revisao_editorial_ausente: 'editorial',
  aprovacao_editorial_ausente: 'editorial',
  autoria_ausente: 'editorial',
  revisor_ausente: 'editorial',
  revisao_anterior_a_atualizacao: 'editorial',
  placeholder_detectado: 'editorial',

  status_nao_qualificado: 'aguardando',
}

const TRACK_LABEL = {
  dado: 'dado — backfill de campo',
  editorial: 'editorial — texto ou assinatura humana',
  aguardando: 'aguardando — situação eleitoral ainda não qualifica',
  desconhecida: 'desconhecida — código novo em seoQuality.ts',
} as const

async function main(): Promise<void> {
  const response = await fetch(`${apiOrigin}/api/candidates/seo-report`)
  if (!response.ok) throw new Error(`Quality report respondeu HTTP ${response.status}`)
  const payload = (await response.json()) as { data: ReportItem[] }

  // A tabela por candidato passa de 500 linhas: rodando sem `--full` ela
  // empurraria o resumo para fora da tela, que é justamente o que se veio ler.
  if (full) {
    console.table(
      payload.data.map((candidate) => ({
        candidato: candidate.name,
        cargo: candidate.position,
        status: candidate.candidacyStatus ?? 'ausente',
        indexavel: candidate.indexable ? 'sim' : 'não',
        modulos: candidate.substantiveModules.length,
        bloqueios: candidate.blockers.join(', ') || '—',
        alertas: candidate.warnings.join(', ') || '—',
        slug: candidate.slug,
      })),
    )
  }

  const indexable = payload.data.filter((candidate) => candidate.indexable).length
  const blocked = payload.data.filter((candidate) => !candidate.indexable)
  console.info(
    `\nResumo: ${indexable}/${payload.data.length} perfis indexáveis · ${blocked.length} fora do índice.`,
  )

  const blockerCounts = new Map<string, number>()
  const blockerExamples = new Map<string, string[]>()
  for (const candidate of payload.data) {
    for (const blocker of candidate.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1)
      const examples = blockerExamples.get(blocker) ?? []
      if (examples.length < 3) examples.push(candidate.slug)
      blockerExamples.set(blocker, examples)
    }
  }

  if (blockerCounts.size > 0) {
    console.info('\nBloqueios por frequência:')
    console.table(
      [...blockerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([bloqueio, perfis]) => ({
          bloqueio,
          perfis,
          fila: BLOCKER_TRACK[bloqueio] ?? 'desconhecida',
          exemplos: (blockerExamples.get(bloqueio) ?? []).join(', '),
        })),
    )
  }

  // Quantas fichas *voltariam* ao índice se cada fila fosse zerada. Uma ficha
  // com bloqueio de dado e de texto ao mesmo tempo não volta só com o backfill,
  // então ela é contada na fila mais cara que a prende — senão o plano promete
  // um ganho que o backfill sozinho não entrega.
  const perTrack = { dado: 0, editorial: 0, aguardando: 0, desconhecida: 0 }
  for (const candidate of blocked) {
    const tracks = new Set<Track>(
      candidate.blockers.map((b) => BLOCKER_TRACK[b] ?? 'desconhecida'),
    )
    const gargalo = tracks.has('desconhecida')
      ? 'desconhecida'
      : tracks.has('editorial')
        ? 'editorial'
        : tracks.has('aguardando')
          ? 'aguardando'
          : 'dado'
    perTrack[gargalo] += 1
  }

  if (blocked.length > 0) {
    console.info('\nFichas bloqueadas, pela fila mais cara que as prende:')
    console.table(
      (['dado', 'editorial', 'aguardando', 'desconhecida'] as const)
        .filter((track) => perTrack[track] > 0)
        .map((track) => ({ fila: TRACK_LABEL[track], fichas: perTrack[track] })),
    )
    console.info(
      `\n${perTrack.dado} ficha(s) voltam ao índice só com backfill de campo — sem escrever uma linha e sem baixar o padrão editorial.`,
    )
  }

  if (strict && indexable !== payload.data.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
