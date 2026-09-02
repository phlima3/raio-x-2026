import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { Position, Prisma, type PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { unzipSync } from 'fflate'
import iconv from 'iconv-lite'

import { createTseCkanClient, type TseCkanClient } from '../sources/tse/ckanClient'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import { candidateScope, parsePositionsArg, parseStateArg } from './extractProgramProposals'
import { logger } from '../utils/logger'

/**
 * Importa a prestação de contas dos CSVs de dados abertos do TSE.
 *
 * Existe porque o `sync:financiamento`, que consulta o DivulgaCandContas, só
 * enxerga a disputa presidencial: o `dadosConsolidados` daquele endpoint volta
 * nulo para cargo estadual mesmo quando a candidatura já entregou. Medido em
 * 2026-09-01 — Lula com 8 entregas e `totalRecebido` preenchido; Haddad,
 * Tarcísio e Marina com `dadosConsolidados: null` e `historicoEntregas: []`.
 * Concluir dali que "o TSE não publicou" era erro de leitura: os CSVs de
 * `prestacao-de-contas-eleitorais-2026` traziam R$ 8,09 mi do Haddad e
 * R$ 10,9 mi do Tarcísio no mesmo dia.
 *
 * O que chega aqui é `RELATÓRIO FINANCEIRO` — a entrega parcial exigida
 * durante a campanha, não a conta final. O valor é o declarado até
 * `accountsUpdatedAt`, e é isso que a ficha mostra ("prestação atualizada em").
 */

const DATASET = 'prestacao-de-contas-eleitorais-2026'
const PACOTE = 'https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/' +
  'prestacao_de_contas_eleitorais_candidatos_2026.zip'

/** `1.234,56` → `1234.56`. Vazio é zero, não `NaN`. */
export function valorBr(value: string | null | undefined): number {
  const limpo = String(value ?? '').trim().replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

/** `dd/mm/aaaa` → `Date`; formato inesperado não vira data inventada. */
export function dataBr(value: string | null | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? '').trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  return Number.isNaN(d.getTime()) ? null : d
}

export type Balde =
  | 'fefc' | 'fundoPartidario' | 'financiamentoColetivo'
  | 'pessoasFisicas' | 'pessoasJuridicas' | 'recursosProprios' | 'outros'

/**
 * Cada receita cai em **um** balde, e a soma dos baldes fecha com o total.
 *
 * Fonte e origem são eixos diferentes no CSV: uma linha de `FUNDO ESPECIAL`
 * tem origem "Recursos de partido político". Somar os dois eixos contaria o
 * mesmo dinheiro duas vezes e faria `otherReceived` (total menos os nomeados)
 * ficar negativo.
 */
export function baldeDaReceita(fonte: string | null, origem: string | null): Balde {
  const f = (fonte ?? '').trim().toUpperCase()
  if (f === 'FUNDO ESPECIAL') return 'fefc'
  if (f === 'FUNDO PARTIDARIO' || f === 'FUNDO PARTIDÁRIO') return 'fundoPartidario'

  const o = (origem ?? '').trim().toLowerCase()
  if (o.includes('financiamento coletivo')) return 'financiamentoColetivo'
  if (o.includes('pessoas físicas') || o.includes('pessoas fisicas')) return 'pessoasFisicas'
  if (o.includes('pessoas jurídicas') || o.includes('pessoas juridicas')) return 'pessoasJuridicas'
  if (o.includes('próprios') || o.includes('proprios')) return 'recursosProprios'
  return 'outros'
}

export interface ReceitaRow {
  SQ_CANDIDATO?: string
  SQ_PRESTADOR_CONTAS?: string
  DS_FONTE_RECEITA?: string
  DS_ORIGEM_RECEITA?: string
  VR_RECEITA?: string
  DT_PRESTACAO_CONTAS?: string
  NM_DOADOR?: string
  NM_DOADOR_RFB?: string
  NR_CPF_CNPJ_DOADOR?: string
}

export interface DespesaRow {
  SQ_PRESTADOR_CONTAS?: string
  VR_PAGTO_DESPESA?: string
}

export interface ContasAgregadas {
  prestadores: Set<string>
  totalReceived: number
  porBalde: Record<Balde, number>
  accountsUpdatedAt: Date | null
  doadores: Array<{ name: string; amount: number; cnpj: string | null }>
}

/**
 * Doador só entra identificado. O CSV usa `-4` (e afins) quando o dado é
 * sigiloso ou inaplicável — publicar aquilo como nome de doador seria ruído
 * apresentado como fonte.
 */
function nomeDoDoador(row: ReceitaRow): string | null {
  for (const candidato of [row.NM_DOADOR_RFB, row.NM_DOADOR]) {
    const nome = (candidato ?? '').trim()
    if (nome && !/^-?\d+$/.test(nome) && nome !== '#NULO' && nome !== '#NE') return nome
  }
  return null
}

export function agregarContas(receitas: ReceitaRow[], despesas: DespesaRow[]): {
  contas: ContasAgregadas
  totalSpent: number
} {
  const porBalde: Record<Balde, number> = {
    fefc: 0, fundoPartidario: 0, financiamentoColetivo: 0,
    pessoasFisicas: 0, pessoasJuridicas: 0, recursosProprios: 0, outros: 0,
  }
  const prestadores = new Set<string>()
  const porDoador = new Map<string, { name: string; amount: number; cnpj: string | null }>()
  let totalReceived = 0
  let accountsUpdatedAt: Date | null = null

  for (const row of receitas) {
    const valor = valorBr(row.VR_RECEITA)
    totalReceived += valor
    porBalde[baldeDaReceita(row.DS_FONTE_RECEITA ?? null, row.DS_ORIGEM_RECEITA ?? null)] += valor
    if (row.SQ_PRESTADOR_CONTAS) prestadores.add(row.SQ_PRESTADOR_CONTAS)

    const entregue = dataBr(row.DT_PRESTACAO_CONTAS)
    if (entregue && (!accountsUpdatedAt || entregue > accountsUpdatedAt)) accountsUpdatedAt = entregue

    const nome = nomeDoDoador(row)
    if (nome) {
      const doc = (row.NR_CPF_CNPJ_DOADOR ?? '').trim()
      const chave = doc && !/^-?\d{1,2}$/.test(doc) ? doc : nome
      const atual = porDoador.get(chave) ??
        { name: nome, amount: 0, cnpj: doc.length >= 11 ? doc : null }
      atual.amount += valor
      porDoador.set(chave, atual)
    }
  }

  const totalSpent = despesas
    .filter((d) => d.SQ_PRESTADOR_CONTAS && prestadores.has(d.SQ_PRESTADOR_CONTAS))
    .reduce((soma, d) => soma + valorBr(d.VR_PAGTO_DESPESA), 0)

  return {
    contas: {
      prestadores,
      totalReceived: round2(totalReceived),
      porBalde,
      accountsUpdatedAt,
      doadores: [...porDoador.values()]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
        .map((d) => ({ ...d, amount: round2(d.amount) })),
    },
    totalSpent: round2(totalSpent),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function lerCsv<T>(bytes: Uint8Array | undefined): T[] {
  if (!bytes) return []
  return parse(iconv.decode(Buffer.from(bytes), 'latin1'), {
    columns: true, delimiter: ';', skip_empty_lines: true, relax_column_count: true, bom: true,
  }) as T[]
}

export interface ImportTseAccountingOptions {
  prisma: PrismaClient
  client?: TseCkanClient
  positions?: Position[]
  state?: string[]
  slug?: string
  year?: number
  dryRun?: boolean
}

export async function importTseAccounting(options: ImportTseAccountingOptions): Promise<{
  alvos: number
  gravadas: number
  semPrestacao: number
}> {
  const year = options.year ?? 2026
  const client = options.client ?? createTseCkanClient()

  const alvos = await options.prisma.candidate.findMany({
    where: { electionYear: year, tseId: { not: null }, ...candidateScope(options) },
    select: {
      id: true, tseId: true, name: true, slug: true, state: true,
      candidacyStatusSourceUrl: true,
      officialDatasetRecords: {
        where: { datasetKind: 'CANDIDATE_COMPLEMENT' },
        select: { payload: true },
        take: 1,
      },
    },
  })
  if (alvos.length === 0) return { alvos: 0, gravadas: 0, semPrestacao: 0 }

  const bytes = (await client.download({
    id: DATASET, name: 'Prestação de contas de candidatos', format: 'ZIP',
    url: PACOTE, kind: 'UNKNOWN' as never,
  })).bytes
  const arquivos = unzipSync(new Uint8Array(bytes))
  logger.info(`[contas] pacote com ${Object.keys(arquivos).length} arquivos`)

  // Um par de CSVs por UF; só se lê o das UFs em jogo.
  const ufs = [...new Set(alvos.map((c) => c.state.toUpperCase()))]
  const receitasPorCandidato = new Map<string, ReceitaRow[]>()
  const despesasPorUf = new Map<string, DespesaRow[]>()
  for (const uf of ufs) {
    for (const row of lerCsv<ReceitaRow>(arquivos[`receitas_candidatos_${year}_${uf}.csv`])) {
      const id = row.SQ_CANDIDATO?.trim()
      if (!id) continue
      const lista = receitasPorCandidato.get(id) ?? []
      lista.push(row)
      receitasPorCandidato.set(id, lista)
    }
    despesasPorUf.set(uf, lerCsv<DespesaRow>(arquivos[`despesas_pagas_candidatos_${year}_${uf}.csv`]))
  }

  let gravadas = 0
  let semPrestacao = 0
  const slugs: string[] = []

  for (const candidate of alvos) {
    const receitas = candidate.tseId ? receitasPorCandidato.get(candidate.tseId) ?? [] : []
    if (receitas.length === 0) {
      // Sem entrega não se grava linha: `totalReceived` é obrigatório no
      // modelo, e um zero ali diria que a campanha não arrecadou.
      semPrestacao++
      continue
    }

    const { contas, totalSpent } = agregarContas(
      receitas,
      despesasPorUf.get(candidate.state.toUpperCase()) ?? [],
    )
    const nomeados = contas.porBalde.fefc + contas.porBalde.fundoPartidario +
      contas.porBalde.financiamentoColetivo + contas.porBalde.pessoasFisicas +
      contas.porBalde.pessoasJuridicas + contas.porBalde.recursosProprios

    // O teto legal de gastos vem do complemento do registro, que já está no
    // banco — o CSV de contas não o traz.
    const complemento = candidate.officialDatasetRecords[0]?.payload as
      Record<string, unknown> | undefined
    const teto = valorBr(
      typeof complemento?.VR_DESPESA_MAX_CAMPANHA === 'string'
        ? complemento.VR_DESPESA_MAX_CAMPANHA.replace('.', ',')
        : null,
    )

    const data = {
      year,
      totalReceived: new Prisma.Decimal(contas.totalReceived),
      totalSpent: new Prisma.Decimal(totalSpent),
      fefcReceived: new Prisma.Decimal(contas.porBalde.fefc),
      partyFundReceived: new Prisma.Decimal(contas.porBalde.fundoPartidario),
      crowdfundingReceived: new Prisma.Decimal(contas.porBalde.financiamentoColetivo),
      individualsReceived: new Prisma.Decimal(contas.porBalde.pessoasFisicas),
      companiesReceived: new Prisma.Decimal(contas.porBalde.pessoasJuridicas),
      ownResourcesReceived: new Prisma.Decimal(contas.porBalde.recursosProprios),
      otherReceived: new Prisma.Decimal(round2(contas.totalReceived - nomeados)),
      spendingLimit: teto > 0 ? new Prisma.Decimal(teto) : null,
      accountsUpdatedAt: contas.accountsUpdatedAt,
      donors: contas.doadores as unknown as Prisma.InputJsonValue,
      sourceUrl: candidate.candidacyStatusSourceUrl,
    }

    gravadas++
    if (candidate.slug) slugs.push(candidate.slug)
    if (options.dryRun) {
      logger.info(
        `[contas] ${candidate.name}: recebido=${contas.totalReceived} gasto=${totalSpent} ` +
          `fefc=${contas.porBalde.fefc} fundo=${contas.porBalde.fundoPartidario} ` +
          `pf=${contas.porBalde.pessoasFisicas} coletivo=${contas.porBalde.financiamentoColetivo} ` +
          `outros=${round2(contas.totalReceived - nomeados)} doadores=${contas.doadores.length}`,
      )
      continue
    }
    await options.prisma.campaignFinancing.upsert({
      where: { candidateId_year: { candidateId: candidate.id, year } },
      update: data,
      create: { ...data, candidateId: candidate.id },
    })
  }

  if (!options.dryRun && gravadas > 0) {
    await invalidateApiCandidateCaches()
    await revalidateCandidatePages(slugs)
  }
  return { alvos: alvos.length, gravadas, semPrestacao }
}

async function main(): Promise<void> {
  const slugArg = process.argv.find((argument) => argument.startsWith('--slug='))
  const prisma = createScraperPrismaClient()
  try {
    const result = await importTseAccounting({
      prisma,
      positions: parsePositionsArg(),
      state: parseStateArg(),
      slug: slugArg ? slugArg.split('=')[1] : undefined,
      dryRun: process.argv.includes('--dry-run'),
    })
    logger.info('[contas] concluído', result)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('[contas] falhou', error)
    process.exit(1)
  })
}
