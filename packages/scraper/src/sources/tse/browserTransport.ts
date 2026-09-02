/**
 * Transporte HTTP do TSE servido por um Chrome de verdade.
 *
 * O TSE responde 403 a cliente automatizado, em todos os hosts. Medido nesta
 * máquina em 2026-08-29, contra `divulgacandcontas`, `dadosabertos` e `cdn`:
 *
 *   curl / fetch do Node / Chromium headless -> 403
 *   Chrome instalado, em modo headed          -> 200
 *
 * Não é bloqueio por IP: o mesmo endereço passa quando quem pede é um browser
 * de verdade. Quem roda no GitHub Actions não esbarra nisso; quem roda na
 * máquina de desenvolvimento, sim. Por isso é opt-in por
 * `TSE_BROWSER_TRANSPORT=1` — sem a variável tudo continua no `fetch` puro,
 * que é mais barato e não precisa de sessão gráfica.
 *
 * O pedido sai por **navegação**, e não por `fetch` de dentro da página: a
 * navegação não passa por CORS, o que permite atender as três origens do TSE
 * com uma aba só. O corpo é recolhido por dois caminhos, conforme o que o
 * Chrome decide fazer com o conteúdo:
 *
 *   JSON e PDF   -> renderiza; o corpo vem por `response.body()`
 *   ZIP          -> baixa; o corpo é lido do arquivo que o Chrome gravou
 *
 * O segundo caminho é o que torna viável o pacote do catálogo: os bytes vão
 * do Chrome direto para o disco, sem atravessar a ponte com o processo Node.
 */

import { readFile } from 'node:fs/promises'
import { chromium, type Browser, type BrowserContext, type Download, type Page } from 'playwright'

import { logger } from '../../utils/logger'

export interface TseBrowserTransport {
  getJson<T>(url: string): Promise<T>
  getBytes(url: string): Promise<Buffer>
}

/**
 * Erro neutro: cada cliente do TSE tem o seu próprio tipo de erro, e é o
 * adaptador de cada um que traduz. O `status` é o que permite distinguir
 * "não existe" de "falhou", distinção que o sync usa para contar.
 */
export class TseBrowserError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TseBrowserError'
  }
}

/** Liga o transporte pelo browser; fora dele o caminho é o `fetch` puro. */
export function tseBrowserEnabled(): boolean {
  const flag = process.env.TSE_BROWSER_TRANSPORT?.trim().toLowerCase()
  return flag === '1' || flag === 'true'
}

/** Separada da navegação por ser a única parte com regra — e testável sem browser. */
export function assertNavigationStatus(url: string, status: number): void {
  if (status < 200 || status >= 300) {
    throw new TseBrowserError(status, `TSE respondeu HTTP ${status} para ${url}`)
  }
}

function isDownloadInterruption(error: unknown): boolean {
  // O Chrome aborta a navegação quando decide baixar o arquivo em vez de
  // exibi-lo; para nós isso é sucesso, não falha.
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Download is starting') || message.includes('ERR_ABORTED')
}

/** Acima disto o corpo vai para o disco pelo download, não pela ponte CDP. */
const CORPO_MAXIMO = 64 * 1024 * 1024

let browser: Browser | null = null
let context: BrowserContext | null = null
let page: Page | null = null
/** Downloads que chegaram antes de alguém esperar por eles. */
const arrivedDownloads: Download[] = []
let downloadWaiter: ((download: Download) => void) | null = null

async function launchChrome(): Promise<Browser> {
  // `channel: 'chrome'` usa o Chrome instalado. O Chromium que acompanha o
  // Playwright é detectado e barrado igual ao `fetch`; a queda para ele serve
  // só para dar erro de rede legível em vez de erro de binário ausente.
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' })
  } catch (error) {
    logger.warn(
      '[tse] Chrome instalado não encontrado; usando o Chromium do Playwright, que o TSE costuma barrar',
      error instanceof Error ? error.message : error,
    )
    return chromium.launch({ headless: false })
  }
}

/**
 * O Chrome cai. Quando isso acontece no meio de uma chamada CDP, a promessa
 * pendente nunca resolve nem rejeita — e o job fica pendurado calado, que é
 * pior do que falhar. Medido em 2026-08-29: o Chrome crashou e o sync ficou
 * 55 minutos parado, com 1,3s de CPU acumulada.
 *
 * Esta promessa rejeita assim que o browser desconecta, e é corrida contra
 * toda requisição.
 */
let quedaDoBrowser: Promise<never> | null = null

async function activePage(): Promise<Page> {
  if (page && !page.isClosed() && browser?.isConnected()) return page
  await closeTseBrowserTransport()
  browser = await launchChrome()
  const vivo = browser
  quedaDoBrowser = new Promise<never>((_, reject) => {
    vivo.once('disconnected', () => {
      reject(new TseBrowserError(null, 'o Chrome caiu no meio da consulta'))
    })
  })
  // Sem isto, a rejeição acima vira unhandledRejection quando ninguém está
  // no meio de uma requisição.
  quedaDoBrowser.catch(() => undefined)
  context = await browser.newContext({ acceptDownloads: true, locale: 'pt-BR' })
  page = await context.newPage()
  page.on('download', (download) => {
    if (downloadWaiter) {
      const resolve = downloadWaiter
      downloadWaiter = null
      resolve(download)
      return
    }
    arrivedDownloads.push(download)
  })
  logger.info('[tse] Transporte pelo browser aberto')
  return page
}

/**
 * O evento de download pode chegar antes ou depois de a navegação rejeitar,
 * então a espera precisa aceitar as duas ordens.
 */
function takeDownload(timeoutMs: number): Promise<Download | null> {
  const queued = arrivedDownloads.shift()
  if (queued) return Promise.resolve(queued)
  return new Promise((resolve) => {
    // O timer precisa morrer junto com a espera: sem `clearTimeout` ele segura
    // o laço de eventos e o script fica pendurado depois de já ter terminado.
    const settle = (download: Download) => {
      clearTimeout(timer)
      downloadWaiter = null
      resolve(download)
    }
    const timer = setTimeout(() => {
      if (downloadWaiter !== settle) return
      downloadWaiter = null
      resolve(null)
    }, timeoutMs)
    downloadWaiter = settle
  })
}

async function readDownload(download: Download, url: string): Promise<Buffer> {
  const path = await download.path()
  if (!path) {
    throw new TseBrowserError(null, `Download sem arquivo em disco para ${url}`)
  }
  try {
    return await readFile(path)
  } finally {
    // O arquivo é temporário do Chrome; sem isto ele fica até o browser fechar.
    await download.delete().catch(() => undefined)
  }
}

/**
 * Prazo sobre a etapa inteira. `page.goto` e a espera de download já têm o
 * seu, mas `response.body()` não tem nenhum: é uma chamada CDP que, se o
 * browser sumir, não volta nunca.
 */
export async function comPrazo<T>(tarefa: Promise<T>, ms: number, oQue: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const estouro = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TseBrowserError(null, `${oQue} passou de ${Math.round(ms / 1000)}s`)),
      ms,
    )
  })
  try {
    return await Promise.race(
      quedaDoBrowser ? [tarefa, estouro, quedaDoBrowser] : [tarefa, estouro],
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * O transporte tem uma aba só e um `downloadWaiter` só (singletons de módulo).
 * Duas consultas concorrentes navegam na mesma `page`: a segunda cancela a
 * navegação da primeira e sobrescreve o waiter dela, que então não resolve
 * nunca e só termina estourando o prazo.
 *
 * `Promise.all([download(a), download(b)])` é o jeito natural de escrever o
 * job — e é o que `sync:tse` e `sync:tse:priority` faziam. Falhava calado três
 * minutos depois, dizendo que o TSE não respondeu quando o que houve foi o
 * segundo download atropelar o primeiro.
 *
 * A fila serializa aqui, onde toda consulta passa, em vez de deixar a regra
 * "não paralelize" para cada job lembrar. O prazo de cada consulta continua
 * contando a partir do trabalho dela, não da espera na fila.
 */
let fila: Promise<unknown> = Promise.resolve()

export function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(tarefa)
  // A fila nunca carrega rejeição adiante: uma consulta que falha não pode
  // derrubar a próxima da fila junto.
  fila = resultado.then(() => undefined, () => undefined)
  return resultado
}

export function createTseBrowserTransport(timeoutMs = 180_000): TseBrowserTransport {
  async function requisitar(url: string, target: Page): Promise<Buffer> {
    try {
      const response = await target.goto(url, { timeout: timeoutMs, waitUntil: 'commit' })
      if (!response) {
        throw new TseBrowserError(null, `Navegação sem resposta para ${url}`)
      }
      assertNavigationStatus(url, response.status())
      // Corpo grande não pode atravessar a ponte CDP: é buffer inteiro na
      // memória do Chrome e na do Node ao mesmo tempo. ZIP o Chrome baixa
      // para o disco (o outro ramo); se algum dia servir um pacote como
      // conteúdo exibível, é melhor falhar dizendo o porquê do que derrubar
      // o browser e travar o job.
      const tamanho = Number(response.headers()['content-length'] ?? 0)
      if (tamanho > CORPO_MAXIMO) {
        throw new TseBrowserError(
          null,
          `${url} devolveu ${Math.round(tamanho / 1024 / 1024)}MB como conteúdo exibível; ` +
            'grande demais para a ponte com o Chrome',
        )
      }
      return await response.body()
    } catch (error) {
      if (error instanceof TseBrowserError) throw error
      if (!isDownloadInterruption(error)) {
        throw new TseBrowserError(null, `Falha ao consultar ${url}`, { cause: error })
      }
      const download = await takeDownload(timeoutMs)
      if (!download) {
        throw new TseBrowserError(null, `O Chrome abortou a navegação sem baixar ${url}`)
      }
      return readDownload(download, url)
    }
  }

  async function consultar(url: string): Promise<Buffer> {
    const target = await activePage()
    try {
      return await comPrazo(requisitar(url, target), timeoutMs, `a consulta a ${url}`)
    } catch (error) {
      // Browser caído ou prazo estourado deixam a aba inútil e a chamada CDP
      // pendurada, o que segura o processo na saída. Derrubar aqui garante
      // que a próxima consulta comece limpa e que o job consiga terminar.
      if (error instanceof TseBrowserError && !browser?.isConnected()) {
        await closeTseBrowserTransport()
      }
      throw error
    }
  }

  function request(url: string): Promise<Buffer> {
    return enfileirar(() => consultar(url))
  }

  return {
    async getJson<T>(url: string): Promise<T> {
      return JSON.parse((await request(url)).toString('utf8')) as T
    },
    async getBytes(url: string): Promise<Buffer> {
      return request(url)
    },
  }
}

export async function closeTseBrowserTransport(): Promise<void> {
  if (!browser) return
  await browser.close().catch(() => undefined)
  browser = null
  context = null
  page = null
  arrivedDownloads.length = 0
  downloadWaiter = null
  logger.info('[tse] Transporte pelo browser encerrado')
}

// Os jobs são scripts de linha de comando: quando o laço de eventos esvazia, o
// trabalho acabou e o Chrome não deve sobreviver ao processo.
process.once('beforeExit', () => {
  void closeTseBrowserTransport()
})
