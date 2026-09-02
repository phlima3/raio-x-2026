import { afterEach, describe, expect, it } from 'vitest'

import {
  assertNavigationStatus,
  comPrazo,
  enfileirar,
  TseBrowserError,
  tseBrowserEnabled,
} from '../src/sources/tse/browserTransport'
import { asDivulgaCandError } from '../src/sources/tse/divulgaCandBrowserPort'

const URL_ANEXO =
  'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/doc/280017002789'

describe('tseBrowserEnabled', () => {
  const original = process.env.TSE_BROWSER_TRANSPORT

  afterEach(() => {
    if (original === undefined) delete process.env.TSE_BROWSER_TRANSPORT
    else process.env.TSE_BROWSER_TRANSPORT = original
  })

  it('stays off unless explicitly turned on, so CI keeps using plain fetch', () => {
    delete process.env.TSE_BROWSER_TRANSPORT
    expect(tseBrowserEnabled()).toBe(false)
    process.env.TSE_BROWSER_TRANSPORT = '0'
    expect(tseBrowserEnabled()).toBe(false)
    process.env.TSE_BROWSER_TRANSPORT = 'false'
    expect(tseBrowserEnabled()).toBe(false)
  })

  it('turns on for 1 and true', () => {
    process.env.TSE_BROWSER_TRANSPORT = '1'
    expect(tseBrowserEnabled()).toBe(true)
    process.env.TSE_BROWSER_TRANSPORT = 'TRUE'
    expect(tseBrowserEnabled()).toBe(true)
  })
})

describe('assertNavigationStatus', () => {
  it('lets any 2xx through', () => {
    expect(() => assertNavigationStatus(URL_ANEXO, 200)).not.toThrow()
    expect(() => assertNavigationStatus(URL_ANEXO, 206)).not.toThrow()
  })

  it('keeps the status on the error, which is what separates missing from failed', () => {
    try {
      assertNavigationStatus(URL_ANEXO, 404)
      expect.unreachable('404 deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(TseBrowserError)
      expect((error as TseBrowserError).status).toBe(404)
    }
  })

  it('rejects the 403 the TSE gives to automated clients', () => {
    // Precisa chegar ao sync como falha, e não como candidatura inexistente.
    try {
      assertNavigationStatus(URL_ANEXO, 403)
      expect.unreachable('403 deveria ter lançado')
    } catch (error) {
      expect((error as TseBrowserError).status).toBe(403)
    }
  })
})

describe('asDivulgaCandError', () => {
  it('turns a 404 into NOT_FOUND, which the sync counts as missing', () => {
    const mapped = asDivulgaCandError(URL_ANEXO, new TseBrowserError(404, 'qualquer'))
    expect(mapped).toMatchObject({ name: 'DivulgaCandError', code: 'NOT_FOUND' })
  })

  it('turns anything else into HTTP_ERROR, which reproves the run', () => {
    const mapped = asDivulgaCandError(URL_ANEXO, new TseBrowserError(403, 'Access Denied'))
    expect(mapped).toMatchObject({ name: 'DivulgaCandError', code: 'HTTP_ERROR' })
  })

  it('leaves an unrelated error alone instead of disguising it', () => {
    // Um bug de programação não pode virar "candidatura sem registro".
    const bug = new TypeError('leitura de undefined')
    expect(asDivulgaCandError(URL_ANEXO, bug)).toBe(bug)
  })
})

describe('comPrazo', () => {
  it('lets a task that finishes in time through untouched', async () => {
    await expect(comPrazo(Promise.resolve('pronto'), 1000, 'a tarefa')).resolves.toBe('pronto')
  })

  it('gives up on a task that never settles, instead of waiting forever', async () => {
    // É o caso real: o Chrome caiu e a chamada CDP não resolveu nem rejeitou.
    // Sem prazo, o sync ficou 55 minutos parado em 2026-08-29.
    const nuncaResolve = new Promise<string>(() => {})
    await expect(comPrazo(nuncaResolve, 50, 'a consulta ao TSE'))
      .rejects.toMatchObject({ name: 'TseBrowserError' })
  })

  it('names what timed out, so o log diz onde travou', async () => {
    await expect(comPrazo(new Promise<string>(() => {}), 50, 'a consulta a X'))
      .rejects.toThrow(/a consulta a X passou de/)
  })

  it('does not leave a timer holding the process after the task wins', async () => {
    // Um timer não cancelado segura o laço de eventos e o script não termina
    // — foi o mesmo tipo de defeito que travou a espera de download.
    const antes = process.getActiveResourcesInfo?.().filter((r) => r === 'Timeout').length ?? 0
    await comPrazo(Promise.resolve(1), 30_000, 'tarefa rápida')
    const depois = process.getActiveResourcesInfo?.().filter((r) => r === 'Timeout').length ?? 0
    expect(depois).toBeLessThanOrEqual(antes)
  })
})


describe('enfileirar', () => {
  // O transporte tem uma aba e um downloadWaiter só: duas consultas ao mesmo
  // tempo atropelam uma à outra e a primeira só termina no prazo de 180s.
  it('serializes overlapping requests instead of letting them share the one tab', async () => {
    const eventos: string[] = []
    const tarefa = (nome: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        eventos.push(`entrou:${nome}`)
        setTimeout(() => {
          eventos.push(`saiu:${nome}`)
          resolve(nome)
        }, ms)
      })

    // `a` é mais lenta de propósito: sem fila, `b` entraria antes de `a` sair.
    const resultados = await Promise.all([
      enfileirar(tarefa('a', 30)),
      enfileirar(tarefa('b', 1)),
    ])

    expect(resultados).toEqual(['a', 'b'])
    expect(eventos).toEqual(['entrou:a', 'saiu:a', 'entrou:b', 'saiu:b'])
  })

  it('lets the next request through after one fails, instead of poisoning the queue', async () => {
    const falha = enfileirar(() => Promise.reject(new Error('caiu')))
    await expect(falha).rejects.toThrow('caiu')
    await expect(enfileirar(() => Promise.resolve('segue'))).resolves.toBe('segue')
  })
})
