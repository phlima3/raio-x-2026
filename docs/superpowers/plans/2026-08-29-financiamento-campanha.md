# Financiamento de campanha — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preencher a seção de financiamento da ficha do candidato com a prestação de contas que o TSE publica, para as 12 candidaturas presidenciais.

**Architecture:** Um módulo novo lê a consulta de prestador do DivulgaCandContas reaproveitando o cliente, o transporte e a porta injetável que já existem; um parser puro traduz o payload e descarta o CPF antes de qualquer persistência; um job próprio grava em `CampaignFinancing`, que ganha colunas para os escalares e mantém JSON para as listas.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, Vitest, Next.js (App Router), Playwright (só no transporte local).

**Spec:** `docs/superpowers/specs/2026-08-29-financiamento-campanha-design.md`

## Global Constraints

- **CPF nunca é gravado.** Documento de 11 dígitos é descartado no parser. Só CNPJ (14 dígitos) é persistido.
- **Escopo: `Position.PRESIDENTE` apenas.** O vice tem registro vazio (`totalRecebido: null`); incluí-lo grava zeros que a tela leria como "não arrecadou".
- **Turno fixo `1`.** Segundo turno está fora de escopo.
- **Ausência ≠ zero.** Toda coluna nova é nula por padrão.
- **Datas do TSE vêm em `dd/MM/yyyy`.** Nunca usar `new Date(string)` nelas.
- Comentários e mensagens de commit em português, seguindo o repositório.
- `idEleicao` vem de `configuredElectionId()`, nunca literal.

---

### Task 1: Colunas de financiamento no schema

**Files:**
- Modify: `packages/api/prisma/schema.prisma` (model `CampaignFinancing`, ~linha 488)
- Create: `packages/api/prisma/migrations/20260830090000_campaign_financing_breakdown/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: colunas `fefcReceived`, `partyFundReceived`, `crowdfundingReceived`, `individualsReceived`, `companiesReceived`, `ownResourcesReceived`, `otherReceived`, `spendingLimit`, `totalContracted`, `accountsUpdatedAt`, `deliveryControlNumber`, `suppliers` em `CampaignFinancing`.

- [ ] **Step 1: Acrescentar as colunas ao model**

Em `packages/api/prisma/schema.prisma`, dentro de `model CampaignFinancing`, logo abaixo de `donors Json?`:

```prisma
  // Composição da receita. Todas nulas: quem não recebeu fundão e quem não foi
  // consultado não podem ficar iguais no banco.
  fefcReceived         Decimal? @db.Decimal(18, 2)
  partyFundReceived    Decimal? @db.Decimal(18, 2)
  crowdfundingReceived Decimal? @db.Decimal(18, 2)
  individualsReceived  Decimal? @db.Decimal(18, 2)
  companiesReceived    Decimal? @db.Decimal(18, 2)
  ownResourcesReceived Decimal? @db.Decimal(18, 2)
  // `totalReceived` menos as seis acima: o TSE expõe onze categorias e só seis
  // têm nome na tela. Sem isto a proporção exibida não fecharia.
  otherReceived        Decimal? @db.Decimal(18, 2)

  spendingLimit   Decimal? @db.Decimal(18, 2)
  totalContracted Decimal? @db.Decimal(18, 2)

  accountsUpdatedAt     DateTime?
  deliveryControlNumber String?
  suppliers             Json?
```

- [ ] **Step 2: Escrever a migration**

Criar `packages/api/prisma/migrations/20260830090000_campaign_financing_breakdown/migration.sql`:

```sql
-- Composição da receita, limite de gastos e estado da prestação, vindos da
-- consulta de prestador do DivulgaCandContas.
-- Todas as colunas nascem nulas de propósito: ausência de dado tem de continuar
-- distinguível de zero arrecadado.
BEGIN;

ALTER TABLE "CampaignFinancing"
  ADD COLUMN IF NOT EXISTS "fefcReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "partyFundReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "crowdfundingReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "individualsReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "companiesReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "ownResourcesReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "otherReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "spendingLimit" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "totalContracted" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "accountsUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryControlNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "suppliers" JSONB;

COMMIT;
```

- [ ] **Step 3: Gerar o cliente Prisma e conferir que compila**

Run: `pnpm --filter @raiox/api run db:generate && pnpm -r typecheck`
Expected: sem erros. O `db:generate` precisa rodar antes do typecheck, senão os tipos novos não existem.

- [ ] **Step 4: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/20260830090000_campaign_financing_breakdown
git commit -m "feat: colunas de composição da receita em CampaignFinancing"
```

---

### Task 2: Parser da prestação de contas

O núcleo da tarefa. É onde o CPF é descartado e onde a composição é fechada.

**Files:**
- Create: `packages/scraper/src/sources/tse/divulgaCandAccounts.ts`
- Test: `packages/scraper/test/tse-divulgacand-accounts.test.ts`

**Interfaces:**
- Consumes: nada (função pura).
- Produces:
  - `interface DivulgaCandParty { name: string; amount: number; count: number; cnpj: string | null; crowdfunding: boolean }`
  - `interface DivulgaCandAccounts` com os campos listados no Step 3.
  - `parseDivulgaCandAccounts(raw: unknown): DivulgaCandAccounts | null`
  - `parseBrazilianDate(value: unknown): Date | null`

- [ ] **Step 1: Escrever os testes que falham**

Criar `packages/scraper/test/tse-divulgacand-accounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  parseBrazilianDate,
  parseDivulgaCandAccounts,
} from '../src/sources/tse/divulgaCandAccounts'

// Recorte fiel da consulta de 2026-08-29 para Renan Santos (280002540694).
const RENAN = {
  idEleicao: 20322002026,
  ano: 2026,
  dataUltimaAtualizacaoContas: '28/08/2026',
  numeroDeControleEntrega: '000140100000BR8258607',
  dadosConsolidados: {
    totalRecebido: 1293445.81,
    graphVrReceitaFinFefc: 0,
    graphVrReceitaFinFundo: 0,
    totalDoacaoFcc: 1220288,
    totalReceitaPF: 73157.81,
    totalReceitaPJ: 0,
    totalProprios: 0,
  },
  despesas: {
    valorLimiteDeGastos: 88944030.8,
    totalDespesasContratadas: 451172.03,
    totalDespesasPagas: 451172.03,
  },
  rankingDoadores: [
    { cpfCnpj: '12345678000190', nome: 'PLATAFORMA DE VAQUINHA LTDA', qntd: 3, valor: 1220288, stFinanciamentoColetivo: true },
    { cpfCnpj: '12345678901', nome: 'MARIA DE SOUZA ANDRADE', qntd: 1, valor: 4014.14, stFinanciamentoColetivo: false },
  ],
  rankingFornecedores: [
    { cpfCnpj: '98765432000110', nome: 'GRAFICA EXEMPLO LTDA', qntd: 2, valor: 30000, stFinanciamentoColetivo: false },
  ],
}

// Augusto Cury: recebeu fundão, e a composição usa três categorias.
const CURY = {
  dataUltimaAtualizacaoContas: null,
  numeroDeControleEntrega: null,
  dadosConsolidados: {
    totalRecebido: 202062,
    graphVrReceitaFinFefc: 50000,
    graphVrReceitaFinFundo: 0,
    totalDoacaoFcc: 0,
    totalReceitaPF: 2062,
    totalReceitaPJ: 0,
    totalProprios: 150000,
  },
  despesas: { valorLimiteDeGastos: 88944030.8, totalDespesasContratadas: 0, totalDespesasPagas: 0 },
  rankingDoadores: [],
  rankingFornecedores: [],
}

describe('parseBrazilianDate', () => {
  it('reads dd/MM/yyyy, which is what the TSE sends', () => {
    expect(parseBrazilianDate('28/08/2026')?.toISOString()).toBe('2026-08-28T00:00:00.000Z')
  })

  it('does not read 08/12 as August, the way new Date would', () => {
    // `new Date('08/12/2026')` devolve 12 de agosto no runtime en-US.
    expect(parseBrazilianDate('08/12/2026')?.toISOString()).toBe('2026-12-08T00:00:00.000Z')
  })

  it('returns null for anything that is not that format', () => {
    for (const value of [null, undefined, '', '2026-08-28', 'ontem', 42]) {
      expect(parseBrazilianDate(value)).toBeNull()
    }
  })
})

describe('parseDivulgaCandAccounts', () => {
  it('reads the totals and the spending limit', () => {
    const accounts = parseDivulgaCandAccounts(RENAN)!
    expect(accounts.totalReceived).toBe(1293445.81)
    expect(accounts.totalSpent).toBe(451172.03)
    expect(accounts.totalContracted).toBe(451172.03)
    expect(accounts.spendingLimit).toBe(88944030.8)
    expect(accounts.accountsUpdatedAt?.toISOString()).toBe('2026-08-28T00:00:00.000Z')
    expect(accounts.deliveryControlNumber).toBe('000140100000BR8258607')
  })

  it('splits the receipt into the six named buckets', () => {
    const accounts = parseDivulgaCandAccounts(RENAN)!
    expect(accounts.crowdfundingReceived).toBe(1220288)
    expect(accounts.individualsReceived).toBe(73157.81)
    expect(accounts.fefcReceived).toBe(0)
    expect(accounts.ownResourcesReceived).toBe(0)
  })

  it('keeps the composition closed through otherReceived', () => {
    // As onze categorias do TSE somam o total; as seis nomeadas nem sempre.
    for (const payload of [RENAN, CURY]) {
      const a = parseDivulgaCandAccounts(payload)!
      const named = a.fefcReceived! + a.partyFundReceived! + a.crowdfundingReceived! +
        a.individualsReceived! + a.companiesReceived! + a.ownResourcesReceived!
      expect(named + a.otherReceived!).toBeCloseTo(a.totalReceived!, 2)
    }
  })

  it('reports the fundão, which is what separates one campaign from another', () => {
    expect(parseDivulgaCandAccounts(CURY)!.fefcReceived).toBe(50000)
    expect(parseDivulgaCandAccounts(RENAN)!.fefcReceived).toBe(0)
  })

  it('keeps the CNPJ of a company donor', () => {
    const donor = parseDivulgaCandAccounts(RENAN)!.donors[0]
    expect(donor.name).toBe('PLATAFORMA DE VAQUINHA LTDA')
    expect(donor.cnpj).toBe('12345678000190')
    expect(donor.amount).toBe(1220288)
    expect(donor.crowdfunding).toBe(true)
  })

  it('never lets an individual CPF through — anywhere in the result', () => {
    // Serializa tudo em vez de olhar o campo certo: é o que sobrevive a uma
    // refatoração que mova o dado de lugar.
    const accounts = parseDivulgaCandAccounts(RENAN)!
    expect(JSON.stringify(accounts)).not.toContain('12345678901')
    const individual = accounts.donors.find((d) => d.name === 'MARIA DE SOUZA ANDRADE')!
    expect(individual.cnpj).toBeNull()
    expect(individual.amount).toBe(4014.14)
  })

  it('treats a candidacy with no accounts as absent, not as zero', () => {
    // É o caso do vice: responde 200, mas com `totalRecebido` nulo.
    expect(parseDivulgaCandAccounts({ dadosConsolidados: { totalRecebido: null } })).toBeNull()
    expect(parseDivulgaCandAccounts({})).toBeNull()
    expect(parseDivulgaCandAccounts(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run packages/scraper/test/tse-divulgacand-accounts.test.ts`
Expected: FAIL — `Failed to resolve import ... divulgaCandAccounts`.

- [ ] **Step 3: Implementar o parser**

Criar `packages/scraper/src/sources/tse/divulgaCandAccounts.ts`:

```ts
/**
 * Leitura da consulta de prestador do DivulgaCandContas — a prestação de
 * contas de uma candidatura.
 *
 * Duas regras moram aqui, e as duas são de correção, não de estilo:
 *
 * 1. O CPF de pessoa física é descartado. O TSE publica o número inteiro e a
 *    doação é pública por lei, mas republicar documento de identificação em
 *    página indexada é exposição a mais sem informação a mais. Só CNPJ passa.
 * 2. A composição fecha. O TSE expõe onze categorias de receita e a tela nomeia
 *    seis; a diferença vai para `otherReceived`, senão a proporção exibida
 *    mentiria para quem usou comercialização ou rendimento de aplicação.
 */

/** Doador ou fornecedor do ranking. `cnpj` é nulo para pessoa física. */
export interface DivulgaCandParty {
  name: string
  amount: number
  count: number
  cnpj: string | null
  crowdfunding: boolean
}

export interface DivulgaCandAccounts {
  totalReceived: number | null
  totalSpent: number | null
  totalContracted: number | null
  spendingLimit: number | null
  fefcReceived: number | null
  partyFundReceived: number | null
  crowdfundingReceived: number | null
  individualsReceived: number | null
  companiesReceived: number | null
  ownResourcesReceived: number | null
  otherReceived: number | null
  accountsUpdatedAt: Date | null
  deliveryControlNumber: string | null
  donors: DivulgaCandParty[]
  suppliers: DivulgaCandParty[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function numberField(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textField(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Centavo é o que interessa; sem isto a subtração deixa lixo de ponto flutuante. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * O TSE envia `dd/MM/yyyy`. `new Date('08/12/2026')` devolveria 12 de agosto
 * num runtime en-US, e `new Date('28/08/2026')` devolveria data inválida.
 */
export function parseBrazilianDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseParties(value: unknown): DivulgaCandParty[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = asRecord(entry)
    const name = textField(record, 'nome')
    const amount = numberField(record, 'valor')
    if (!name || amount === null) return []
    const document = textField(record, 'cpfCnpj')
    return [{
      name,
      amount,
      count: numberField(record, 'qntd') ?? 0,
      // 14 dígitos é CNPJ e fica; 11 é CPF e é descartado aqui, antes de
      // qualquer gravação.
      cnpj: document && /^\d{14}$/.test(document) ? document : null,
      crowdfunding: record?.stFinanciamentoColetivo === true,
    }]
  })
}

export function parseDivulgaCandAccounts(raw: unknown): DivulgaCandAccounts | null {
  const payload = asRecord(raw)
  const consolidated = asRecord(payload?.dadosConsolidados)
  const totalReceived = numberField(consolidated, 'totalRecebido')
  // Sem total não há prestação: é o que a consulta do vice devolve, e gravar
  // zero ali faria a tela dizer que a chapa não arrecadou.
  if (totalReceived === null) return null

  const expenses = asRecord(payload?.despesas)
  const fefcReceived = numberField(consolidated, 'graphVrReceitaFinFefc') ?? 0
  const partyFundReceived = numberField(consolidated, 'graphVrReceitaFinFundo') ?? 0
  const crowdfundingReceived = numberField(consolidated, 'totalDoacaoFcc') ?? 0
  const individualsReceived = numberField(consolidated, 'totalReceitaPF') ?? 0
  const companiesReceived = numberField(consolidated, 'totalReceitaPJ') ?? 0
  const ownResourcesReceived = numberField(consolidated, 'totalProprios') ?? 0
  const named = fefcReceived + partyFundReceived + crowdfundingReceived +
    individualsReceived + companiesReceived + ownResourcesReceived

  return {
    totalReceived,
    totalSpent: numberField(expenses, 'totalDespesasPagas'),
    totalContracted: numberField(expenses, 'totalDespesasContratadas'),
    spendingLimit: numberField(expenses, 'valorLimiteDeGastos'),
    fefcReceived,
    partyFundReceived,
    crowdfundingReceived,
    individualsReceived,
    companiesReceived,
    ownResourcesReceived,
    otherReceived: round2(totalReceived - named),
    accountsUpdatedAt: parseBrazilianDate(payload?.dataUltimaAtualizacaoContas),
    deliveryControlNumber: textField(payload, 'numeroDeControleEntrega'),
    donors: parseParties(payload?.rankingDoadores),
    suppliers: parseParties(payload?.rankingFornecedores),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run packages/scraper/test/tse-divulgacand-accounts.test.ts`
Expected: PASS, 10 testes (3 de `parseBrazilianDate`, 7 de `parseDivulgaCandAccounts`).

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/src/sources/tse/divulgaCandAccounts.ts packages/scraper/test/tse-divulgacand-accounts.test.ts
git commit -m "feat: parser da prestação de contas, sem gravar CPF"
```

---

### Task 3: Consulta de prestação no cliente

**Files:**
- Modify: `packages/scraper/src/sources/tse/divulgaCand.ts`
- Test: `packages/scraper/test/tse-divulgacand-client.test.ts` (acrescentar ao final)

**Interfaces:**
- Consumes: `DivulgaCandTarget`, `DivulgaCandHttpPort`, `trimBaseUrl`, `DIVULGACAND_BASE_URL` (todos já em `divulgaCand.ts`); `parseDivulgaCandAccounts` e `DivulgaCandAccounts` da Task 2.
- Produces:
  - `divulgaCandAccountsUrl(target: DivulgaCandTarget, ballotNumber: number, round?: number, baseUrl?: string): string`
  - `DivulgaCandClient.fetchAccounts(target: DivulgaCandTarget, ballotNumber: number): Promise<DivulgaCandAccounts | null>`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `packages/scraper/test/tse-divulgacand-client.test.ts`:

```ts
describe('divulgaCandAccountsUrl', () => {
  const target = parseDivulgaCandUrl(CANDIDATE_URL)

  it('builds the address the SPA actually calls', () => {
    // Confirmado em 2026-08-29 observando a própria página: o quarto segmento
    // é o turno, e não o `tpPrestador` — que vem "CA" no corpo.
    expect(divulgaCandAccountsUrl(target, 14)).toBe(
      'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta' +
        '/20322002026/2026/BR/1/14/14/280002540694',
    )
  })

  it('takes the round as a parameter, for when the second one exists', () => {
    expect(divulgaCandAccountsUrl(target, 14, 2)).toContain('/BR/2/14/14/')
  })
})

describe('DivulgaCand client accounts', () => {
  const target = parseDivulgaCandUrl(CANDIDATE_URL)

  it('parses the accounts of one candidacy', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({
        dadosConsolidados: {
          totalRecebido: 202062,
          graphVrReceitaFinFefc: 50000,
          totalProprios: 150000,
          totalReceitaPF: 2062,
        },
        despesas: { valorLimiteDeGastos: 88944030.8, totalDespesasPagas: 0 },
        rankingDoadores: [],
        rankingFornecedores: [],
      }),
      getBytes: vi.fn(),
    }

    const accounts = await createDivulgaCandClient({ http }).fetchAccounts(target, 70)

    expect(http.getJson).toHaveBeenCalledWith(divulgaCandAccountsUrl(target, 70))
    expect(accounts?.fefcReceived).toBe(50000)
    expect(accounts?.totalReceived).toBe(202062)
  })

  it('returns null for a candidacy with no accounts, like a running mate', async () => {
    const http: DivulgaCandHttpPort = {
      getJson: vi.fn().mockResolvedValue({ dadosConsolidados: { totalRecebido: null } }),
      getBytes: vi.fn(),
    }

    expect(await createDivulgaCandClient({ http }).fetchAccounts(target, 14)).toBeNull()
  })
})
```

Acrescentar `divulgaCandAccountsUrl` à lista de imports no topo do arquivo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run packages/scraper/test/tse-divulgacand-client.test.ts`
Expected: FAIL — `divulgaCandAccountsUrl is not exported`.

- [ ] **Step 3: Implementar**

Em `packages/scraper/src/sources/tse/divulgaCand.ts`, acrescentar o import no topo:

```ts
import {
  parseDivulgaCandAccounts,
  type DivulgaCandAccounts,
} from './divulgaCandAccounts'
```

Acrescentar a URL, logo depois de `divulgaCandFileUrl`:

```ts
/**
 * Endereço da prestação de contas. Os sete segmentos foram confirmados contra a
 * própria página em 2026-08-29, comparando duas candidaturas: o quarto é o
 * **turno** — o turno 2 devolve uma casca vazia enquanto não houver segundo
 * turno — e não o `tpPrestador`, que vem "CA" no corpo.
 *
 * Na eleição majoritária o número do candidato é o do partido, e é por isso que
 * o mesmo valor serve aos dois segmentos. Estender para deputado exige guardar
 * o número do partido à parte.
 */
export function divulgaCandAccountsUrl(
  target: DivulgaCandTarget,
  ballotNumber: number,
  round = 1,
  baseUrl = DIVULGACAND_BASE_URL,
): string {
  return `${trimBaseUrl(baseUrl)}/divulga/rest/v1/prestador/consulta` +
    `/${target.electionId}/${target.year}/${target.electoralUnit}/${round}` +
    `/${ballotNumber}/${ballotNumber}/${target.candidateId}`
}
```

Acrescentar à interface `DivulgaCandClient`:

```ts
  fetchAccounts(
    target: DivulgaCandTarget,
    ballotNumber: number,
  ): Promise<DivulgaCandAccounts | null>
```

E ao objeto devolvido por `createDivulgaCandClient`, depois de `downloadFile`:

```ts
    async fetchAccounts(target, ballotNumber) {
      const payload = await http.getJson<unknown>(
        divulgaCandAccountsUrl(target, ballotNumber, 1, baseUrl),
      )
      return parseDivulgaCandAccounts(payload)
    },
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run packages/scraper/test/tse-divulgacand-client.test.ts && pnpm --filter @raiox/scraper typecheck`
Expected: PASS em todos, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/src/sources/tse/divulgaCand.ts packages/scraper/test/tse-divulgacand-client.test.ts
git commit -m "feat: consulta de prestação de contas no cliente do DivulgaCand"
```

---

### Task 4: Job de sincronização

**Files:**
- Modify: `packages/scraper/src/sources/tseDivulgaCand.ts` (exportar `resolveTargets` e `CandidateRow`)
- Create: `packages/scraper/src/sources/tseFinanciamento.ts`
- Modify: `packages/scraper/package.json` (script `sync:financiamento`)
- Modify: `.github/workflows/sync-tse.yml` (passo novo)
- Test: `packages/scraper/test/tse-financiamento.test.ts`

**Interfaces:**
- Consumes: `resolveTargets`, `CandidateRow` (exportados aqui); `DivulgaCandClient.fetchAccounts` da Task 3; colunas da Task 1.
- Produces: `runFinanciamentoSync(options: RunFinanciamentoSyncOptions): Promise<CompletedSyncRun>` e `syncFinanciamento(options?): Promise<CompletedSyncRun>`.

- [ ] **Step 1: Exportar o que será reaproveitado e trazer o número de urna**

Em `packages/scraper/src/sources/tseDivulgaCand.ts`, três mudanças.

Tornar públicos os dois símbolos:

```ts
export interface CandidateRow {
```
```ts
export async function resolveTargets(
```

Acrescentar o campo à interface `CandidateRow`, depois de `position`:

```ts
  ballotNumber: number | null
```

E ao objeto `select` dentro de `resolveTargets`, depois de `position: true`:

```ts
    ballotNumber: true,
```

Sem isto o job não tem como montar a URL, e o `select` do Prisma não devolve o
campo mesmo existindo na tabela.

- [ ] **Step 2: Escrever o teste que falha**

Criar `packages/scraper/test/tse-financiamento.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { financingUpdateData } from '../src/sources/tseFinanciamento'

const ACCOUNTS = {
  totalReceived: 202062,
  totalSpent: 0,
  totalContracted: 0,
  spendingLimit: 88944030.8,
  fefcReceived: 50000,
  partyFundReceived: 0,
  crowdfundingReceived: 0,
  individualsReceived: 2062,
  companiesReceived: 0,
  ownResourcesReceived: 150000,
  otherReceived: 0,
  accountsUpdatedAt: new Date('2026-08-28T00:00:00.000Z'),
  deliveryControlNumber: '000140100000BR8258607',
  donors: [
    { name: 'EMPRESA LTDA', amount: 50000, count: 1, cnpj: '12345678000190', crowdfunding: false },
    { name: 'MARIA ANDRADE', amount: 2062, count: 1, cnpj: null, crowdfunding: false },
  ],
  suppliers: [],
}

describe('financingUpdateData', () => {
  it('maps the parsed accounts onto the columns', () => {
    const data = financingUpdateData(ACCOUNTS, 2026, 'https://exemplo/candidato')
    expect(data.year).toBe(2026)
    expect(data.totalReceived).toBe(202062)
    expect(data.fefcReceived).toBe(50000)
    expect(data.spendingLimit).toBe(88944030.8)
    expect(data.sourceUrl).toBe('https://exemplo/candidato')
    expect(data.accountsUpdatedAt).toEqual(new Date('2026-08-28T00:00:00.000Z'))
  })

  it('cites the candidacy page, never a file to download', () => {
    // Foi o defeito que a ficha já teve nas propostas e no patrimônio.
    const data = financingUpdateData(ACCOUNTS, 2026, 'https://exemplo/candidato')
    expect(String(data.sourceUrl)).not.toMatch(/\.(zip|pdf)$/i)
  })

  it('carries no CPF into the stored donors', () => {
    const data = financingUpdateData(ACCOUNTS, 2026, 'https://exemplo/candidato')
    const serialized = JSON.stringify(data.donors)
    expect(serialized).toContain('12345678000190')
    expect(serialized).toContain('MARIA ANDRADE')
    expect(serialized).not.toContain('cpf')
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run packages/scraper/test/tse-financiamento.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar o job**

Criar `packages/scraper/src/sources/tseFinanciamento.ts`:

```ts
import { createScraperPrismaClient } from '../utils/prisma'
import 'dotenv/config'
import { DataSource, Position, Prisma, type PrismaClient } from '@prisma/client'

import {
  createPrismaSyncRunStore,
  runDataSourceSync,
  type CompletedSyncRun,
} from '../sync/runDataSourceSync'
import { invalidateApiCandidateCaches } from '../utils/invalidateApiCache'
import { logger } from '../utils/logger'
import { revalidateCandidatePages } from '../utils/revalidateWeb'
import { tseBrowserEnabled } from './tse/browserTransport'
import {
  createBrowserDivulgaCandHttpPort,
  type DisposableDivulgaCandHttpPort,
} from './tse/divulgaCandBrowserPort'
import {
  configuredElectionId,
  createDivulgaCandClient,
  divulgaCandPublicUrl,
  DivulgaCandError,
  type DivulgaCandClient,
} from './tse/divulgaCand'
import type { DivulgaCandAccounts } from './tse/divulgaCandAccounts'
import { resolveTargets } from './tseDivulgaCand'

export interface RunFinanciamentoSyncOptions {
  prisma: PrismaClient
  client?: DivulgaCandClient
  year?: number
  electionId?: string
  tseIds?: string[]
  limit?: number
  dryRun?: boolean
}

/**
 * Monta a linha de `CampaignFinancing`. Separada do laço por ser a parte com
 * regra — e a única que se testa sem banco.
 *
 * `sourceUrl` é a página da candidatura, e não um arquivo: citar o pacote fazia
 * o "ver no TSE" do patrimônio virar um download em vez de uma fonte legível.
 */
export function financingUpdateData(
  accounts: DivulgaCandAccounts,
  year: number,
  candidatePage: string,
) {
  return {
    year,
    totalReceived: accounts.totalReceived ?? 0,
    totalSpent: accounts.totalSpent ?? 0,
    totalContracted: accounts.totalContracted,
    spendingLimit: accounts.spendingLimit,
    fefcReceived: accounts.fefcReceived,
    partyFundReceived: accounts.partyFundReceived,
    crowdfundingReceived: accounts.crowdfundingReceived,
    individualsReceived: accounts.individualsReceived,
    companiesReceived: accounts.companiesReceived,
    ownResourcesReceived: accounts.ownResourcesReceived,
    otherReceived: accounts.otherReceived,
    accountsUpdatedAt: accounts.accountsUpdatedAt,
    deliveryControlNumber: accounts.deliveryControlNumber,
    donors: accounts.donors as unknown as Prisma.InputJsonValue,
    suppliers: accounts.suppliers as unknown as Prisma.InputJsonValue,
    sourceUrl: candidatePage,
  }
}

export async function runFinanciamentoSync(
  options: RunFinanciamentoSyncOptions,
): Promise<CompletedSyncRun> {
  const year = options.year ?? 2026
  const electionId = options.electionId ?? configuredElectionId()
  const client = options.client ?? createDivulgaCandClient()

  return runDataSourceSync({
    source: DataSource.TSE,
    kind: 'divulgacand-financiamento',
    sourceUrl: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/${electionId}`,
    dryRun: options.dryRun,
    store: createPrismaSyncRunStore(options.prisma),
    execute: async () => {
      // Só o titular: a consulta do vice responde 200 com `totalRecebido` nulo,
      // e gravar zero ali faria a ficha dizer que a chapa não arrecadou.
      const targets = await resolveTargets(
        { ...options, positions: [Position.PRESIDENTE] },
        year,
        electionId,
      )
      if (targets.length === 0) return { noop: true, metrics: { candidates: 0 } }

      let consulted = 0
      let updated = 0
      let withoutAccounts = 0
      let withoutNumber = 0
      let failed = 0
      const touchedSlugs = new Set<string>()

      for (const { target, candidate } of targets) {
        if (!candidate) continue
        if (candidate.ballotNumber == null) {
          // Sem número não há como endereçar a consulta, e número não se adivinha.
          withoutNumber++
          logger.warn(`[financiamento] ${candidate.name} sem ballotNumber`)
          continue
        }

        let accounts: DivulgaCandAccounts | null
        try {
          accounts = await client.fetchAccounts(target, candidate.ballotNumber)
        } catch (error) {
          if (error instanceof DivulgaCandError && error.code === 'NOT_FOUND') {
            withoutAccounts++
            continue
          }
          failed++
          logger.error(
            `[financiamento] Consulta falhou para ${candidate.name}`,
            error instanceof Error ? error.message : error,
          )
          continue
        }
        consulted++

        if (!accounts) {
          withoutAccounts++
          continue
        }

        const data = financingUpdateData(accounts, year, divulgaCandPublicUrl(target))
        updated++
        if (candidate.slug) touchedSlugs.add(candidate.slug)
        if (!options.dryRun) {
          await options.prisma.campaignFinancing.upsert({
            where: { candidateId_year: { candidateId: candidate.id, year } },
            update: data,
            create: { ...data, candidateId: candidate.id },
          })
        }
      }

      if (!options.dryRun && touchedSlugs.size > 0) {
        await invalidateApiCandidateCaches()
        await revalidateCandidatePages([...touchedSlugs])
      }

      const metrics = {
        candidates: targets.length,
        consulted,
        updated,
        withoutAccounts,
        withoutNumber,
        failed,
      }
      if (failed > 0) {
        throw new Error(`[financiamento] ${failed} consulta(s) falharam`)
      }
      return { noop: updated === 0, metrics }
    },
  })
}

export async function syncFinanciamento(
  options: Omit<RunFinanciamentoSyncOptions, 'prisma'> = {},
): Promise<CompletedSyncRun> {
  const prisma = createScraperPrismaClient()
  const browserPort: DisposableDivulgaCandHttpPort | null =
    !options.client && tseBrowserEnabled() ? createBrowserDivulgaCandHttpPort() : null
  try {
    const result = await runFinanciamentoSync({
      prisma,
      ...options,
      client: options.client ??
        (browserPort ? createDivulgaCandClient({ http: browserPort }) : undefined),
    })
    logger.info('[financiamento] Concluído', result)
    return result
  } finally {
    await browserPort?.dispose()
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  const limitArgument = process.argv.find((argument) => /^--limit=\d+$/.test(argument))
  syncFinanciamento({
    dryRun: process.argv.includes('--dry-run'),
    limit: limitArgument ? Number(limitArgument.split('=')[1]) : undefined,
  }).catch((error) => {
    logger.error('[financiamento] Erro fatal', error)
    process.exit(1)
  })
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run packages/scraper/test/tse-financiamento.test.ts && pnpm --filter @raiox/scraper typecheck`
Expected: PASS, typecheck limpo.

- [ ] **Step 6: Registrar o script e o passo do workflow**

Em `packages/scraper/package.json`, na seção `scripts`, depois de `sync:divulgacand`:

```json
    "sync:financiamento": "tsx src/sources/tseFinanciamento.ts",
```

Em `.github/workflows/sync-tse.yml`, acrescentar como último passo do job:

```yaml
      # Prestação de contas da chapa presidencial. Muda ao longo da campanha,
      # diferente do documento de registro, por isso acompanha o sync diário.
      - name: Sync campaign financing
        if: ${{ !cancelled() }}
        run: pnpm --filter @raiox/scraper run sync:financiamento ${{ inputs.dry_run && '-- --dry-run' || '' }}
```

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/src/sources/tseFinanciamento.ts packages/scraper/src/sources/tseDivulgaCand.ts \
  packages/scraper/test/tse-financiamento.test.ts packages/scraper/package.json .github/workflows/sync-tse.yml
git commit -m "feat: job de sincronização da prestação de contas"
```

---

### Task 5: Bloco de financiamento na ficha

**Files:**
- Create: `packages/web/lib/financing.ts`
- Test: `packages/web/lib/financing.test.ts`
- Modify: `packages/web/components/TransparencyPanel.tsx` (aba `financing`, ~linha 255)

> O pacote `web` não usa Vitest: os testes vivem em `packages/web/lib/*.test.ts`
> e rodam com `node:test` via `tsx --test lib/*.test.ts`. O Vitest da raiz só
> varre `packages/*/test/**`. Por isso o cálculo puro vai para `lib/`, que é
> onde a lógica testável do pacote já mora, e o componente só o consome.

**Interfaces:**
- Consumes: os campos novos, que chegam sozinhos — `detailInclude` usa `include` do model inteiro, então nenhuma mudança é necessária na API.
- Produces: `financingComposition(financing: FinancingComposable): Array<{ label: string; value: number; share: number }>` em `packages/web/lib/financing.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/web/lib/financing.test.ts`, no estilo `node:test` que o pacote usa:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { financingComposition } from './financing'

test('orders the buckets by size and skips the empty ones', () => {
  const parts = financingComposition({
    totalReceived: 1293445.81,
    fefcReceived: 0,
    partyFundReceived: 0,
    crowdfundingReceived: 1220288,
    individualsReceived: 73157.81,
    companiesReceived: 0,
    ownResourcesReceived: 0,
    otherReceived: 0,
  })
  assert.deepEqual(parts.map((part) => part.label), [
    'Financiamento coletivo',
    'Pessoas físicas',
  ])
  assert.ok(Math.abs(parts[0].share - 94.35) < 0.1)
})

test('shows the fundão when the campaign received one', () => {
  const parts = financingComposition({
    totalReceived: 202062,
    fefcReceived: 50000,
    partyFundReceived: 0,
    crowdfundingReceived: 0,
    individualsReceived: 2062,
    companiesReceived: 0,
    ownResourcesReceived: 150000,
    otherReceived: 0,
  })
  assert.deepEqual(parts.map((part) => part.label), [
    'Recursos próprios',
    'Fundo eleitoral (FEFC)',
    'Pessoas físicas',
  ])
})

test('keeps the shares adding up to the whole', () => {
  // `otherReceived` existe justamente para isto: sem ele a proporção exibida
  // mentiria para quem usou comercialização ou rendimento de aplicação.
  const parts = financingComposition({
    totalReceived: 1000,
    fefcReceived: 400,
    partyFundReceived: 0,
    crowdfundingReceived: 0,
    individualsReceived: 100,
    companiesReceived: 0,
    ownResourcesReceived: 0,
    otherReceived: 500,
  })
  const total = parts.reduce((sum, part) => sum + part.share, 0)
  assert.ok(Math.abs(total - 100) < 0.01)
})

test('returns nothing when there is no total, instead of dividing by zero', () => {
  assert.deepEqual(
    financingComposition({
      totalReceived: 0,
      fefcReceived: 0,
      partyFundReceived: 0,
      crowdfundingReceived: 0,
      individualsReceived: 0,
      companiesReceived: 0,
      ownResourcesReceived: 0,
      otherReceived: 0,
    }),
    [],
  )
})

test('reads the decimal strings Prisma returns without turning them into NaN', () => {
  // `Decimal` chega serializado como string na resposta da API.
  const parts = financingComposition({
    totalReceived: '202062',
    fefcReceived: '50000',
    partyFundReceived: '0',
    crowdfundingReceived: '0',
    individualsReceived: '2062',
    companiesReceived: '0',
    ownResourcesReceived: '150000',
    otherReceived: '0',
  })
  assert.equal(parts[0].label, 'Recursos próprios')
  assert.equal(parts[0].value, 150000)
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @raiox/web test`
Expected: FAIL — não existe `./financing`.

- [ ] **Step 3: Implementar o cálculo**

Criar `packages/web/lib/financing.ts`:

```ts
/**
 * Composição da receita de campanha, para exibição.
 *
 * As parcelas somam o total porque `otherReceived` absorve as categorias que a
 * tela não nomeia — o TSE expõe onze e aqui se nomeiam seis. Sem essa sobra a
 * proporção exibida não fecharia para quem usou comercialização ou rendimento
 * de aplicação, e a soma das fatias passaria de 100%.
 */

const COMPOSITION_LABELS = [
  ['ownResourcesReceived', 'Recursos próprios'],
  ['fefcReceived', 'Fundo eleitoral (FEFC)'],
  ['partyFundReceived', 'Fundo partidário'],
  ['crowdfundingReceived', 'Financiamento coletivo'],
  ['individualsReceived', 'Pessoas físicas'],
  ['companiesReceived', 'Pessoas jurídicas'],
  ['otherReceived', 'Outras origens'],
] as const

type CompositionKey = (typeof COMPOSITION_LABELS)[number][0]

/** `Decimal` do Prisma chega como string depois de serializado pela API. */
type Money = number | string | null | undefined

export type FinancingComposable = { totalReceived: Money } & Partial<
  Record<CompositionKey, Money>
>

export interface FinancingSlice {
  label: string
  value: number
  share: number
}

function amount(value: Money): number {
  const parsed = typeof value === 'string' ? Number(value) : value ?? 0
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

export function financingComposition(financing: FinancingComposable): FinancingSlice[] {
  const total = amount(financing.totalReceived)
  if (total <= 0) return []
  return COMPOSITION_LABELS
    .map(([key, label]) => {
      const value = amount(financing[key])
      return { label, value, share: (value / total) * 100 }
    })
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @raiox/web test`
Expected: PASS, incluindo os 5 testes novos.

- [ ] **Step 5: Exibir na aba de financiamento**

Em `packages/web/components/TransparencyPanel.tsx`, acrescentar ao topo:

```tsx
import { financingComposition } from '@/lib/financing'
```

> Conferir o alias antes: se o arquivo já importa de `../lib/...` em vez de
> `@/lib/...`, seguir a forma que estiver em uso no arquivo.

Dentro do `div` da aba `financing`, **depois** dos dois cartões existentes de
total arrecadado e total gasto, e **antes** do link do rodapé:

```tsx
                  <div className="col-span-full p-6 md:p-8 border-t border-ink/20">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-4">
                      De onde veio
                    </p>
                    <ul className="space-y-2">
                      {financingComposition(data.financing).map((slice) => (
                        <li key={slice.label} className="flex items-baseline justify-between gap-4">
                          <span className="text-sm">{slice.label}</span>
                          <span className="font-mono text-xs tabular-nums text-ink-muted">
                            {fmtBRL(slice.value)} · {slice.share.toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {data.financing.spendingLimit && (
                    <div className="col-span-full p-6 md:p-8 border-t border-ink/20">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-3">
                        Limite legal de gastos
                      </p>
                      <p className="font-serif text-2xl tabular-nums">
                        {fmtBRL(data.financing.spendingLimit)}
                      </p>
                    </div>
                  )}

                  <PartyList title="Maiores doadores" people={data.financing.donors} />
                  <PartyList title="Maiores fornecedores" people={data.financing.suppliers} />

                  {data.financing.accountsUpdatedAt && (
                    <p className="col-span-full px-6 md:px-8 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted border-t border-ink/20">
                      Prestação atualizada em{' '}
                      {new Date(data.financing.accountsUpdatedAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
```

Trocar o rótulo do link do rodapé de `Dados completos no TSE ↗` para
`Ver no TSE ↗`: ele agora aponta para a página da candidatura, e não para um
arquivo.

E acrescentar o componente auxiliar, ao lado de `EmptyState` no fim do arquivo:

```tsx
/**
 * Doadores e fornecedores compartilham o mesmo formato. O CNPJ aparece quando
 * existe; pessoa física entra só com nome e valor, porque o CPF não é gravado.
 */
function PartyList({ title, people }: { title: string; people: unknown }) {
  if (!Array.isArray(people) || people.length === 0) return null
  const parties = people as Array<{ name: string; amount: number; cnpj: string | null }>
  return (
    <div className="col-span-full p-6 md:p-8 border-t border-ink/20">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted mb-4">
        {title}
      </p>
      <ul className="space-y-2">
        {parties.map((party) => (
          <li
            key={`${party.name}-${party.amount}`}
            className="flex items-baseline justify-between gap-4"
          >
            <span className="text-sm">
              {party.name}
              {party.cnpj && (
                <span className="font-mono text-[10px] text-ink-muted ml-2">
                  CNPJ {party.cnpj}
                </span>
              )}
            </span>
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              {fmtBRL(party.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Conferir tipos e a suíte inteira**

Run: `pnpm -r typecheck && pnpm test:unit`
Expected: sem erros, tudo passando.

- [ ] **Step 7: Commit**

```bash
git add packages/web/lib/financing.ts packages/web/lib/financing.test.ts \
  packages/web/components/TransparencyPanel.tsx
git commit -m "feat: composição da receita, doadores e fornecedores na ficha"
```

---

## Verificação final

Depois da Task 5, contra o TSE de verdade, na máquina de desenvolvimento:

```bash
TSE_BROWSER_TRANSPORT=1 pnpm --filter @raiox/scraper run sync:financiamento -- --dry-run
```

Esperado nas métricas: `candidates: 12`, `consulted: 12`, `withoutAccounts` só para quem ainda não entregou, `failed: 0`.

Gravar depende de `DATABASE_URL`, que ainda não foi fornecida — confirmar o banco alvo antes de rodar sem `--dry-run`.
