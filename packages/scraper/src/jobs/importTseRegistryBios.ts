import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { Position, type PrismaClient } from '@prisma/client'

import { parseTseCandidateArchive } from '../sources/tse/candidateArchive'
import { createTseCkanClient, TseResourceKind } from '../sources/tse/ckanClient'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import { candidateScope, parsePositionsArg, parseStateArg } from './extractProgramProposals'
import { logger } from '../utils/logger'

/**
 * Monta a ficha de registro de cada candidatura a partir do que a pessoa
 * declarou ao TSE: nascimento, naturalidade, ocupação e grau de instrução.
 *
 * É texto derivado de campo oficial, não redação — e é por isso que dá para
 * aplicar a todas as candidaturas com o mesmo critério, sem depender de quanta
 * imprensa cada nome teve. Num site de comparação, o favorito e o nanico
 * recebendo tratamentos diferentes é o próprio viés.
 *
 * Grava o mesmo texto em `bio` e `bioSummary` — a ficha já é a forma curta, e
 * não há versão longa da qual ela seria o resumo. O rótulo sob a introdução
 * lê a procedência pela fonte citada (`bioProvenance`, no web) e anuncia
 * "ficha do registro no TSE": nada aqui passou por modelo, e chamar isso de
 * síntese de IA seria afirmação falsa sobre o texto.
 */

/** Preposição junto ao nome do estado, para "é natural ___". */
const NATURALIDADE: Record<string, string> = {
  AC: 'do Acre', AL: 'de Alagoas', AM: 'do Amazonas', AP: 'do Amapá',
  BA: 'da Bahia', CE: 'do Ceará', DF: 'do Distrito Federal',
  ES: 'do Espírito Santo', GO: 'de Goiás', MA: 'do Maranhão',
  MG: 'de Minas Gerais', MS: 'do Mato Grosso do Sul', MT: 'do Mato Grosso',
  PA: 'do Pará', PB: 'da Paraíba', PE: 'de Pernambuco', PI: 'do Piauí',
  PR: 'do Paraná', RJ: 'do Rio de Janeiro', RN: 'do Rio Grande do Norte',
  RO: 'de Rondônia', RR: 'de Roraima', RS: 'do Rio Grande do Sul',
  SC: 'de Santa Catarina', SE: 'de Sergipe', SP: 'de São Paulo',
  TO: 'do Tocantins',
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** `dd/mm/aaaa` do TSE por extenso; qualquer outro formato não vira frase. */
export function dataPorExtenso(value: string | null | undefined): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim())
  if (!match) return null
  const [, dia, mes, ano] = match
  const mesIndex = Number(mes) - 1
  if (mesIndex < 0 || mesIndex > 11) return null
  return `${Number(dia)} de ${MESES[mesIndex]} de ${ano}`
}

/**
 * O TSE escreve ocupação e grau de instrução em caixa alta ("PROFESSOR DE
 * ENSINO SUPERIOR"); no meio da frase eles vão em minúscula. As duas tabelas
 * são só substantivo comum — não há sigla a preservar.
 */
export function rotuloEmMinuscula(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

const POR_CONTRAIDO: Record<string, string> = { de: 'por', do: 'pelo', da: 'pela' }

/**
 * "de São Paulo" → "por São Paulo", "do Rio de Janeiro" → "pelo Rio de Janeiro".
 *
 * `por` contrai com o artigo do nome do estado. Trocar as três formas por
 * `por ` escrevia "uma vaga ao Senado por Bahia": entre as UFs, só as sem
 * artigo ("de São Paulo", "de Minas Gerais") saíam certas, e SP é justamente a
 * UF em que a frase foi conferida primeiro.
 */
export function senadoPor(estado: string): string {
  return estado.replace(/^(de|do|da) /, (_, artigo: string) => `${POR_CONTRAIDO[artigo]} `)
}

const CARGO_FRASE: Partial<Record<Position, (estado: string) => string>> = {
  [Position.GOVERNADOR]: (estado) => `o governo ${estado}`,
  [Position.VICE_GOVERNADOR]: (estado) => `a vice-governança ${estado}`,
  [Position.SENADOR]: (estado) => `uma vaga ao Senado ${senadoPor(estado)}`,
  [Position.PRESIDENTE]: () => 'a Presidência da República',
}

export interface FichaInput {
  position: Position
  state: string
  party: string
  ballotNumber: number | null
  birthDate?: string | null
  birthState?: string | null
  occupation?: string | null
  education?: string | null
}

/**
 * `OUTROS` é o código de escape da tabela de ocupações do TSE: o que ele
 * informa é que nenhuma das ocupações listadas serve, não uma ocupação da
 * pessoa. "Declarou à Justiça Eleitoral a ocupação de outros" publica como
 * declaração de alguém o que é lacuna da tabela — some da frase, como qualquer
 * campo ausente.
 */
function ocupacaoDeclarada(value: string | null | undefined): string | null {
  const occupation = value?.trim()
  if (!occupation || occupation.toLocaleUpperCase('pt-BR') === 'OUTROS') return null
  return occupation
}

/**
 * A frase só afirma o que o registro traz. Campo ausente some da frase em vez
 * de virar "não informado": a ficha é uma citação do registro, e preencher
 * lacuna com texto nosso apaga a diferença entre o que foi declarado e o que
 * não foi.
 */
export function fichaDeRegistro(input: FichaInput): string | null {
  const frases: string[] = []

  const nascimento = dataPorExtenso(input.birthDate)
  const naturalidade = input.birthState ? NATURALIDADE[input.birthState.toUpperCase()] : undefined
  if (nascimento && naturalidade) frases.push(`Nasceu em ${nascimento} e é natural ${naturalidade}.`)
  else if (nascimento) frases.push(`Nasceu em ${nascimento}.`)
  else if (naturalidade) frases.push(`É natural ${naturalidade}.`)

  const cargo = CARGO_FRASE[input.position]?.(NATURALIDADE[input.state.toUpperCase()] ?? input.state)
  if (cargo) {
    const numero = input.ballotNumber != null ? `, com o número ${input.ballotNumber}` : ''
    frases.push(`Disputa ${cargo} pelo ${input.party}${numero}.`)
  }

  const declarado: string[] = []
  const occupation = ocupacaoDeclarada(input.occupation)
  if (occupation) declarado.push(`a ocupação de ${rotuloEmMinuscula(occupation)}`)
  if (input.education) declarado.push(`grau de instrução ${rotuloEmMinuscula(input.education)}`)
  if (declarado.length > 0) {
    frases.push(
      `No registro da candidatura, declarou à Justiça Eleitoral ${declarado.join(' e ')}.`,
    )
  }

  // Só cargo e partido é o que a ficha já mostra em campo próprio; não é bio.
  return declarado.length > 0 || nascimento ? frases.join(' ') : null
}

/** A ficha só é reescrita por ela mesma; texto curado tem precedência. */
export function podeSobrescrever(
  candidate: { bio: string | null; bioSourceUrl: string | null },
  fonte: string,
): boolean {
  if (!candidate.bio?.trim()) return true
  return candidate.bioSourceUrl === fonte
}

export interface ImportTseRegistryBiosOptions {
  prisma: PrismaClient
  positions?: Position[]
  state?: string[]
  slug?: string
  dryRun?: boolean
}

export async function importTseRegistryBios(
  options: ImportTseRegistryBiosOptions,
): Promise<{ alvos: number; gravadas: number; preservadas: number; semDados: number }> {
  const client = createTseCkanClient()
  const resource = (await client.discover(2026)).find(
    (item) => item.kind === TseResourceKind.CANDIDATES,
  )
  if (!resource) throw new Error('[bios] recurso de candidaturas ausente no catálogo do TSE')

  const parsed = parseTseCandidateArchive((await client.download(resource)).bytes)
  const porTseId = new Map(parsed.records.map((record) => [record.tseId, record]))
  logger.info(`[bios] snapshot com ${parsed.records.length} candidaturas`)

  const alvos = await options.prisma.candidate.findMany({
    where: {
      electionYear: 2026,
      tseId: { not: null },
      ...candidateScope(options),
    },
    select: {
      id: true, tseId: true, name: true, slug: true, party: true, state: true,
      position: true, ballotNumber: true, bio: true, bioSummary: true, bioSourceUrl: true,
      candidacyStatusSourceUrl: true,
    },
  })

  let gravadas = 0
  let preservadas = 0
  let semDados = 0
  const slugs: string[] = []

  for (const candidate of alvos) {
    const record = candidate.tseId ? porTseId.get(candidate.tseId) : undefined
    if (!record) { semDados++; continue }

    const fonte = candidate.candidacyStatusSourceUrl
    if (!fonte) {
      // Ficha sem fonte citável não se publica: o leitor precisa poder conferir.
      semDados++
      logger.warn(`[bios] ${candidate.name} sem página do DivulgaCandContas`)
      continue
    }

    const raw = record.raw as Record<string, string | null>
    const texto = fichaDeRegistro({
      position: candidate.position,
      state: candidate.state,
      party: candidate.party,
      ballotNumber: candidate.ballotNumber,
      birthDate: raw.DT_NASCIMENTO,
      birthState: raw.SG_UF_NASCIMENTO,
      occupation: raw.DS_OCUPACAO,
      education: raw.DS_GRAU_INSTRUCAO,
    })
    if (!texto) { semDados++; continue }

    if (!podeSobrescrever(candidate, fonte)) { preservadas++; continue }
    // Só pula quando os dois campos já estão em dia: uma ficha gravada antes
    // de `bioSummary` entrar no job tem `bio` igual e resumo vazio.
    if (candidate.bio === texto && candidate.bioSummary === texto) { preservadas++; continue }

    gravadas++
    if (candidate.slug) slugs.push(candidate.slug)
    if (!options.dryRun) {
      await options.prisma.candidate.update({
        where: { id: candidate.id },
        // `bio` e `bioSummary` recebem o mesmo texto porque a ficha já é a
        // forma curta: não há versão longa da qual ela seria o resumo. A página
        // trata a igualdade e não oferece "ler biografia completa".
        data: {
          bio: texto,
          bioSummary: texto,
          bioSourceUrl: fonte,
          materialUpdatedAt: new Date(),
        },
      })
    } else {
      logger.info(`[bios] ${candidate.name}: ${texto}`)
    }
  }

  if (!options.dryRun && gravadas > 0) {
    await invalidateApiCandidateCaches()
    await revalidateCandidatePages(slugs)
  }

  return { alvos: alvos.length, gravadas, preservadas, semDados }
}

async function main(): Promise<void> {
  const slugArg = process.argv.find((argument) => argument.startsWith('--slug='))
  const prisma = createScraperPrismaClient()
  try {
    const result = await importTseRegistryBios({
      prisma,
      positions: parsePositionsArg(),
      state: parseStateArg(),
      slug: slugArg ? slugArg.split('=')[1] : undefined,
      dryRun: process.argv.includes('--dry-run'),
    })
    logger.info('[bios] concluído', result)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[bios] falhou', error)
    process.exit(1)
  })
}
