import {
  parseDivulgaCandAccounts,
  type DivulgaCandAccounts,
} from './divulgaCandAccounts'

/**
 * Cliente do DivulgaCandContas — a consulta pública de candidaturas do TSE.
 *
 * Diferente do catálogo de dados abertos (CKAN), que publica um ZIP por
 * unidade eleitoral com todos os programas de governo juntos, o
 * DivulgaCandContas expõe **uma candidatura por vez**: o JSON de detalhe traz
 * os sites declarados, os e-mails e os anexos (entre eles a proposta de
 * governo) daquele candidato. É a fonte certa quando se quer anexar links de
 * um punhado de candidaturas — presidenciáveis, por exemplo — sem baixar
 * centenas de megabytes de pacote.
 *
 * Uma candidatura é endereçada por quatro valores, todos legíveis na URL que o
 * TSE divulga:
 *
 *   https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002540694/2026/BR
 *                                                            ↑  ↑  ↑           ↑            ↑
 *                                                            UF UE idEleicao   idCandidato  ano
 *
 * `idCandidato` é o mesmo `SQ_CANDIDATO` dos dados abertos, ou seja, o
 * `Candidate.tseId` que já guardamos — por isso dá para montar a URL de
 * qualquer candidatura já importada sabendo apenas o `idEleicao`.
 */

export const DIVULGACAND_BASE_URL = 'https://divulgacandcontas.tse.jus.br'

/** Eleição geral de 2026, lida da URL pública do TSE. */
export const DIVULGACAND_ELECTION_ID_2026 = '20322002026'

export type DivulgaCandFileKind = 'CAMPAIGN_PROGRAM' | 'ATTACHMENT'

export interface DivulgaCandTarget {
  year: number
  /** Abrangência/UF do registro (`BR` na eleição presidencial). */
  uf: string
  /** Unidade eleitoral (`BR` na eleição presidencial, a UF nas estaduais). */
  electoralUnit: string
  electionId: string
  /** `SQ_CANDIDATO`; corresponde a `Candidate.tseId`. */
  candidateId: string
}

export interface DivulgaCandFile {
  id: string
  name: string
  typeCode: string | null
  typeLabel: string | null
  kind: DivulgaCandFileKind
  url: string
}

export interface DivulgaCandCandidate {
  target: DivulgaCandTarget
  /** URL do JSON consultado; vira `sourceUrl` do que for persistido. */
  apiUrl: string
  /** Página pública da candidatura, para citar na interface. */
  publicUrl: string
  tseId: string
  ballotName: string | null
  fullName: string | null
  party: string | null
  positionLabel: string | null
  statusLabel: string | null
  sites: string[]
  emails: string[]
  files: DivulgaCandFile[]
}

export interface DivulgaCandHttpPort {
  getJson<T>(url: string): Promise<T>
  getBytes(url: string): Promise<Buffer>
}

export interface DivulgaCandClient {
  fetchCandidate(target: DivulgaCandTarget): Promise<DivulgaCandCandidate>
  downloadFile(file: DivulgaCandFile): Promise<Buffer>
  fetchAccounts(
    target: DivulgaCandTarget,
    ballotNumber: number,
  ): Promise<DivulgaCandAccounts | null>
}

export interface CreateDivulgaCandClientOptions {
  baseUrl?: string
  http?: DivulgaCandHttpPort
}

export class DivulgaCandError extends Error {
  constructor(
    readonly code: 'INVALID_URL' | 'HTTP_ERROR' | 'NOT_FOUND' | 'INVALID_PAYLOAD',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'DivulgaCandError'
  }
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function isYearSegment(segment: string): boolean {
  return /^\d{4}$/.test(segment) && Number(segment) >= 1990 && Number(segment) <= 2100
}

function urlSegments(url: string): string[] {
  const hashIndex = url.indexOf('#')
  const path = hashIndex >= 0 ? url.slice(hashIndex + 1) : url
  const segments = path
    .split(/[?&]/)[0]
    .split('/')
    .map((segment) => decodeURIComponent(segment.trim()))
    .filter(Boolean)
  const anchor = segments.indexOf('candidato')
  return anchor >= 0 ? segments.slice(anchor + 1) : []
}

/**
 * Aceita as duas rotas que o TSE já usou para a página de candidatura:
 *
 *   2026:    #/candidato/{uf}/{ue}/{idEleicao}/{idCandidato}/{ano}/{abrangencia}
 *   legado:  #/candidato/{ano}/{idEleicao}/{ue}/{idCandidato}
 *
 * A posição do ano é o que separa uma da outra — nenhum outro segmento tem
 * quatro dígitos.
 */
export function parseDivulgaCandUrl(url: string): DivulgaCandTarget {
  const segments = urlSegments(url)
  if (segments.length === 0) {
    throw new DivulgaCandError('INVALID_URL', `URL sem rota /candidato: ${url}`)
  }

  const yearIndex = segments.findIndex(isYearSegment)
  if (yearIndex === 4 && segments.length >= 5) {
    const [uf, electoralUnit, electionId, candidateId, year] = segments
    return assertTarget({
      year: Number(year),
      uf: uf.toUpperCase(),
      electoralUnit: electoralUnit.toUpperCase(),
      electionId,
      candidateId,
    }, url)
  }
  if (yearIndex === 0 && segments.length >= 4) {
    const [year, electionId, electoralUnit, candidateId] = segments
    return assertTarget({
      year: Number(year),
      uf: electoralUnit.toUpperCase(),
      electoralUnit: electoralUnit.toUpperCase(),
      electionId,
      candidateId,
    }, url)
  }

  // Três segmentos (`/candidato/BR/BR/20322002026`) endereçam a eleição, não uma
  // candidatura: é a tela de busca. Vale a mensagem explícita porque essa URL
  // circula junto com as de candidato.
  if (segments.length === 3 && !segments.some(isYearSegment)) {
    throw new DivulgaCandError(
      'INVALID_URL',
      `URL identifica a eleição ${segments[2]}, não uma candidatura: ${url}`,
    )
  }
  throw new DivulgaCandError('INVALID_URL', `Rota de candidatura não reconhecida: ${url}`)
}

/** Extrai só o `idEleicao` de uma URL de eleição ou de candidatura. */
export function parseDivulgaCandElectionId(url: string): string {
  const segments = urlSegments(url)
  if (segments.length === 3 && !segments.some(isYearSegment)) return segments[2]
  return parseDivulgaCandUrl(url).electionId
}

function assertTarget(target: DivulgaCandTarget, url: string): DivulgaCandTarget {
  if (!/^\d+$/.test(target.electionId) || !/^\d+$/.test(target.candidateId)) {
    throw new DivulgaCandError(
      'INVALID_URL',
      `Identificadores não numéricos em ${url}: eleição=${target.electionId} candidatura=${target.candidateId}`,
    )
  }
  if (!/^[A-Z]{2}$/.test(target.electoralUnit) && !/^\d{5}$/.test(target.electoralUnit)) {
    throw new DivulgaCandError(
      'INVALID_URL',
      `Unidade eleitoral inválida em ${url}: ${target.electoralUnit}`,
    )
  }
  return target
}

export function divulgaCandApiUrl(target: DivulgaCandTarget, baseUrl = DIVULGACAND_BASE_URL): string {
  return `${trimBaseUrl(baseUrl)}/divulga/rest/v1/candidatura/buscar/${target.year}` +
    `/${target.electoralUnit}/${target.electionId}/candidato/${target.candidateId}`
}

export function divulgaCandPublicUrl(
  target: DivulgaCandTarget,
  baseUrl = DIVULGACAND_BASE_URL,
): string {
  return `${trimBaseUrl(baseUrl)}/divulga/#/candidato/${target.uf}/${target.electoralUnit}` +
    `/${target.electionId}/${target.candidateId}/${target.year}/${target.uf}`
}

/**
 * O anexo é servido pelo id do arquivo, e não por um caminho montado a partir
 * da candidatura: `GET /divulga/rest/arquivo/doc/{idArquivo}` responde 200 com
 * `Content-Type: application/pdf`.
 *
 * O payload traz um campo `url` em cada anexo
 * (`candidaturas/oficial/2026/BR/BR/6257/candidatos/151/`), que é caminho
 * interno de armazenamento: concatenado com o nome do arquivo responde 403.
 * Não usar — nem ele, nem qualquer caminho derivado da candidatura.
 */
export function divulgaCandFileUrl(fileId: string, baseUrl = DIVULGACAND_BASE_URL): string {
  return `${trimBaseUrl(baseUrl)}/divulga/rest/arquivo/doc/${encodeURIComponent(fileId)}`
}

/**
 * Endereço da prestação de contas. Os sete segmentos foram confirmados contra a
 * própria página em 2026-08-29, comparando duas candidaturas: o quarto é o
 * **turno** — o turno 2 devolve uma casca vazia enquanto não houver segundo
 * turno — e não o `tpPrestador`, que vem "CA" no corpo.
 *
 * O quinto segmento é o **número do partido** e o sexto o do candidato. Em
 * presidente e governador os dois coincidem — a urna usa as duas casas da
 * legenda — e por isso repetir o mesmo valor funcionou enquanto a varredura era
 * presidencial. No Senado o número tem três casas (Marina 180, Derrite 111): as
 * duas primeiras são a legenda e a terceira distingue os dois candidatos da
 * mesma. Repetir o número ali devolve corpo vazio, que chega como
 * "Unexpected end of JSON input" — medido em 2026-09-01 contra as 14
 * candidaturas ao Senado por SP; `18/180` responde, `180/180` não.
 */
export function divulgaCandPartyNumber(ballotNumber: number): number {
  const digits = String(Math.trunc(Math.abs(ballotNumber)))
  return digits.length <= 2 ? Number(digits) : Number(digits.slice(0, 2))
}

export function divulgaCandAccountsUrl(
  target: DivulgaCandTarget,
  ballotNumber: number,
  round = 1,
  baseUrl = DIVULGACAND_BASE_URL,
): string {
  return `${trimBaseUrl(baseUrl)}/divulga/rest/v1/prestador/consulta` +
    `/${target.electionId}/${target.year}/${target.electoralUnit}/${round}` +
    `/${divulgaCandPartyNumber(ballotNumber)}/${ballotNumber}/${target.candidateId}`
}

/**
 * `BR` na eleição presidencial; a UF nas demais. O DivulgaCandContas indexa a
 * candidatura pela unidade eleitoral, não pelo domicílio do candidato.
 */
export function electoralUnitFor(position: string, state: string | null): string {
  const national = position === 'PRESIDENTE' || position === 'VICE_PRESIDENTE'
  if (national) return 'BR'
  const uf = (state ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(uf)) {
    throw new DivulgaCandError('INVALID_URL', `UF inválida para o cargo ${position}: ${state}`)
  }
  return uf
}

export function targetForCandidate(input: {
  tseId: string
  position: string
  state: string | null
  electionYear: number
  electionId: string
}): DivulgaCandTarget {
  const electoralUnit = electoralUnitFor(input.position, input.state)
  return {
    year: input.electionYear,
    uf: electoralUnit,
    electoralUnit,
    electionId: input.electionId,
    candidateId: input.tseId,
  }
}

/**
 * Página pública da candidatura para citar na interface, ou `null` quando não
 * dá para endereçá-la.
 *
 * Total de propósito. `electoralUnitFor` recusa UF inválida numa disputa
 * estadual, e uma linha ruim do snapshot não pode derrubar a importação
 * inteira: sem página, quem cita cai no endereço do dataset.
 *
 * O `idEleicao` sai de `configuredElectionId()`, **nunca** do `electionId` do
 * registro tabular — aquele é o `CD_ELEICAO` dos dados abertos, um número
 * diferente. Trocar um pelo outro monta uma URL que responde, mas para outra
 * eleição.
 */
export function candidacyPublicUrl(
  input: {
    tseId: string | null
    position: string
    state: string | null
    electionYear: number
  },
  baseUrl = DIVULGACAND_BASE_URL,
): string | null {
  if (!input.tseId || !/^\d+$/.test(input.tseId)) return null
  try {
    return divulgaCandPublicUrl(
      targetForCandidate({
        tseId: input.tseId,
        position: input.position,
        state: input.state,
        electionYear: input.electionYear,
        electionId: configuredElectionId(),
      }),
      baseUrl,
    )
  } catch {
    return null
  }
}

/** `codTipo` da proposta de governo no mapa de tipos do DivulgaCandContas. */
const CAMPAIGN_PROGRAM_TYPE_CODE = '5'

/**
 * Rótulos lidos do mapa de tipos do próprio DivulgaCandContas. Só os
 * confirmados entram: o anexo traz `tipo`, mas ali vem a extensão do arquivo
 * (`"pdf"`, `"do 1.pdf"`), não a descrição do documento.
 */
const FILE_TYPE_LABELS: Record<string, string> = {
  '1': 'Certidão',
  '5': 'Proposta de Governo',
  '13': 'Certidão criminal da Justiça Estadual de 1º grau',
  '14': 'Certidão criminal da Justiça Estadual de 2º grau',
}

/**
 * O `codTipo` é o que o TSE usa para montar a aba "Propostas" da página, e é o
 * sinal confiável: o nome do arquivo é livre e vem como o candidato enviou
 * (`"ilovepdfmerged 1compressed.pdf"`). O nome só decide quando o código é
 * desconhecido, para um tipo novo não sumir da coleta.
 */
function classifyFile(
  name: string,
  typeCode: string | null,
  typeLabel: string | null,
): DivulgaCandFileKind {
  if (typeCode === CAMPAIGN_PROGRAM_TYPE_CODE) return 'CAMPAIGN_PROGRAM'
  if (typeCode && typeCode in FILE_TYPE_LABELS) return 'ATTACHMENT'
  const token = normalizeToken(`${name} ${typeLabel ?? ''}`)
  const isProgram = token.includes('proposta') ||
    token.includes('programa de governo') ||
    token.includes('plano de governo')
  return isProgram ? 'CAMPAIGN_PROGRAM' : 'ATTACHMENT'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textField(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

/**
 * `sites` e `emails` chegam ora como lista de strings, ora como lista de
 * objetos (`{ endereco }`, `{ email }`). Normaliza os dois formatos e descarta
 * o que não for endereço utilizável.
 */
function stringList(value: unknown, ...keys: string[]): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value]
  const collected = raw.flatMap((entry) => {
    if (typeof entry === 'string') return [entry.trim()]
    const record = asRecord(entry)
    if (!record) return []
    const text = textField(record, ...keys)
    return text ? [text] : []
  })
  return [...new Set(collected.filter(Boolean))]
}

function parseFiles(
  payload: Record<string, unknown>,
  baseUrl: string,
): DivulgaCandFile[] {
  const raw = [
    ...(Array.isArray(payload.arquivos) ? payload.arquivos : []),
    ...(Array.isArray(payload.arquivo) ? payload.arquivo : []),
  ]
  const files = raw.flatMap((entry) => {
    const record = asRecord(entry)
    if (!record) return []
    const name = textField(record, 'nomeArquivo', 'nome', 'arquivo')
    const id = textField(record, 'idArquivo', 'id')
    // Sem id não há como baixar: o download é por `arquivo/doc/{idArquivo}`.
    if (!name || !id) return []
    const typeCode = textField(record, 'codTipo', 'cdTipo')
    const typeLabel = textField(record, 'descricaoTipo', 'dsTipo') ??
      (typeCode ? FILE_TYPE_LABELS[typeCode] ?? null : null)
    return [{
      id,
      name,
      typeCode,
      typeLabel,
      kind: classifyFile(name, typeCode, typeLabel),
      url: divulgaCandFileUrl(id, baseUrl),
    }]
  })
  // O TSE repete o mesmo anexo em consultas diferentes; o id é a identidade.
  const byId = new Map(files.map((file) => [file.id, file]))
  return [...byId.values()]
}

export function parseDivulgaCandPayload(
  raw: unknown,
  target: DivulgaCandTarget,
  baseUrl = DIVULGACAND_BASE_URL,
): DivulgaCandCandidate {
  const payload = asRecord(raw)
  if (!payload) {
    throw new DivulgaCandError(
      'INVALID_PAYLOAD',
      `Resposta do DivulgaCandContas não é um objeto para a candidatura ${target.candidateId}`,
    )
  }

  // A consulta responde 200 com um corpo de erro quando o id não existe; sem
  // nome nem anexo não há candidatura para anexar.
  const ballotName = textField(payload, 'nomeUrna', 'nomeUrnaCandidato')
  const fullName = textField(payload, 'nomeCompleto', 'nome')
  if (!ballotName && !fullName) {
    throw new DivulgaCandError(
      'NOT_FOUND',
      `Candidatura ${target.candidateId} sem nome na resposta do DivulgaCandContas`,
    )
  }

  const party = asRecord(payload.partido)
  const position = asRecord(payload.cargo)
  return {
    target,
    apiUrl: divulgaCandApiUrl(target, baseUrl),
    publicUrl: divulgaCandPublicUrl(target, baseUrl),
    // O `id` do payload é interno da consulta; a chave que cruza com os dados
    // abertos é o sequencial da URL.
    tseId: target.candidateId,
    ballotName,
    fullName,
    party: party ? textField(party, 'sigla', 'nome') : textField(payload, 'siglaPartido'),
    positionLabel: position ? textField(position, 'nome', 'descricao') : null,
    statusLabel: textField(payload, 'descricaoTotalizacao', 'nomeSituacao', 'descricaoSituacao'),
    sites: stringList(payload.sites, 'endereco', 'site', 'url').filter(
      (site) => /^https?:\/\//i.test(site),
    ),
    emails: stringList(payload.emails, 'email', 'endereco'),
    files: parseFiles(payload, baseUrl),
  }
}

export function createFetchDivulgaCandHttpPort(timeoutMs = 30_000): DivulgaCandHttpPort {
  async function checkedFetch(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RaioX2026Bot/1.0 (official-data-sync)',
        Accept: 'application/json, application/pdf;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 404) {
      throw new DivulgaCandError('NOT_FOUND', `DivulgaCandContas respondeu 404 para ${url}`)
    }
    if (!response.ok) {
      throw new DivulgaCandError(
        'HTTP_ERROR',
        `DivulgaCandContas respondeu HTTP ${response.status} para ${url}`,
      )
    }
    return response
  }

  return {
    async getJson<T>(url: string): Promise<T> {
      return (await checkedFetch(url)).json() as Promise<T>
    },
    async getBytes(url: string): Promise<Buffer> {
      return Buffer.from(await (await checkedFetch(url)).arrayBuffer())
    },
  }
}

export function createDivulgaCandClient(
  options: CreateDivulgaCandClientOptions = {},
): DivulgaCandClient {
  const baseUrl = trimBaseUrl(
    options.baseUrl ?? process.env.TSE_DIVULGACAND_URL ?? DIVULGACAND_BASE_URL,
  )
  const http = options.http ?? createFetchDivulgaCandHttpPort()

  return {
    async fetchCandidate(target) {
      const payload = await http.getJson<unknown>(divulgaCandApiUrl(target, baseUrl))
      return parseDivulgaCandPayload(payload, target, baseUrl)
    },
    async downloadFile(file) {
      return http.getBytes(file.url)
    },
    async fetchAccounts(target, ballotNumber) {
      const payload = await http.getJson<unknown>(
        divulgaCandAccountsUrl(target, ballotNumber, 1, baseUrl),
      )
      return parseDivulgaCandAccounts(payload)
    },
  }
}

/** `idEleicao` corrente; sobrescrevível sem novo deploy quando o TSE republica. */
export function configuredElectionId(): string {
  const configured = process.env.TSE_DIVULGACAND_ELECTION_ID?.trim()
  return configured && /^\d+$/.test(configured) ? configured : DIVULGACAND_ELECTION_ID_2026
}
