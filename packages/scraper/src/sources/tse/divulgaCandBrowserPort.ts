/**
 * Adaptador do transporte pelo browser para a porta do DivulgaCandContas.
 *
 * O motivo de existir o transporte está em `browserTransport.ts`. Aqui só se
 * traduz o erro neutro dele no `DivulgaCandError` que o sync já sabe tratar —
 * e a tradução importa: 404 é candidatura sem registro, que o sync conta como
 * `missing`, enquanto qualquer outro erro é `failed` e reprova a rodada.
 *
 * Fica em arquivo separado de `divulgaCand.ts` para o parser e o cliente
 * continuarem importáveis sem arrastar o Playwright junto.
 */

import { DivulgaCandError, type DivulgaCandHttpPort } from './divulgaCand'
import {
  closeTseBrowserTransport,
  createTseBrowserTransport,
  TseBrowserError,
} from './browserTransport'

export interface DisposableDivulgaCandHttpPort extends DivulgaCandHttpPort {
  dispose(): Promise<void>
}

/** Traduz o erro do transporte no vocabulário do DivulgaCandContas. */
export function asDivulgaCandError(url: string, error: unknown): unknown {
  if (!(error instanceof TseBrowserError)) return error
  if (error.status === 404) {
    return new DivulgaCandError('NOT_FOUND', `DivulgaCandContas respondeu 404 para ${url}`)
  }
  return new DivulgaCandError('HTTP_ERROR', error.message, { cause: error })
}

export function createBrowserDivulgaCandHttpPort(): DisposableDivulgaCandHttpPort {
  const transport = createTseBrowserTransport()

  async function mapped<T>(url: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      throw asDivulgaCandError(url, error)
    }
  }

  return {
    getJson: <T>(url: string) => mapped(url, () => transport.getJson<T>(url)),
    getBytes: (url: string) => mapped(url, () => transport.getBytes(url)),
    dispose: closeTseBrowserTransport,
  }
}
