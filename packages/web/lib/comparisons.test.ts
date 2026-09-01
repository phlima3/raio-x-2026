import assert from 'node:assert/strict'
import test from 'node:test'
import { buildComparisonSlug, eligibleOpponents, raceOf, sameRace } from './comparisons'

test('builds one deterministic URL for a candidate pair regardless of selection order', () => {
  assert.equal(buildComparisonSlug('zema-novo-mg', 'lula-pt-sp'), 'lula-pt-sp-x-zema-novo-mg')
  assert.equal(buildComparisonSlug('lula-pt-sp', 'zema-novo-mg'), 'lula-pt-sp-x-zema-novo-mg')
  assert.throws(() => buildComparisonSlug('lula-pt-sp', 'lula-pt-sp'))
})

test('só oferece adversário da mesma disputa depois da primeira escolha', () => {
  const candidatos = [
    { slug: 'lula-pt-br', position: 'PRESIDENTE', state: 'BR' },
    { slug: 'zema-novo-br', position: 'PRESIDENTE', state: 'BR' },
    { slug: 'tarcisio-sp', position: 'GOVERNADOR', state: 'SP' },
    { slug: 'haddad-sp', position: 'GOVERNADOR', state: 'SP' },
    { slug: 'castro-rj', position: 'GOVERNADOR', state: 'RJ' },
    { slug: 'eudo-pcb-ac', position: 'SENADOR', state: 'AC' },
  ]

  // Sem escolha ainda, tudo é elegível.
  assert.equal(eligibleOpponents(candidatos, undefined).length, 6)

  // Escolhido um presidenciável, governador e senador saem da lista.
  assert.deepEqual(
    eligibleOpponents(candidatos, 'lula-pt-br').map((c) => c.slug),
    ['lula-pt-br', 'zema-novo-br'],
  )
})

test('cargo estadual também recorta pela UF: SP não disputa contra RJ', () => {
  const candidatos = [
    { slug: 'tarcisio-sp', position: 'GOVERNADOR', state: 'SP' },
    { slug: 'haddad-sp', position: 'GOVERNADOR', state: 'SP' },
    { slug: 'castro-rj', position: 'GOVERNADOR', state: 'RJ' },
  ]
  assert.deepEqual(
    eligibleOpponents(candidatos, 'tarcisio-sp').map((c) => c.slug),
    ['tarcisio-sp', 'haddad-sp'],
  )
  // Presidente é disputa nacional; a UF não recorta.
  assert.deepEqual(raceOf({ position: 'PRESIDENTE', state: 'BR' }), {
    position: 'PRESIDENTE',
    state: null,
  })
  assert.equal(
    sameRace({ position: 'GOVERNADOR', state: 'SP' }, { position: 'GOVERNADOR', state: 'RJ' }),
    false,
  )
})

test('primeiro escolhido não resolvido esvazia a lista, em vez de liberar todo mundo', () => {
  // Era o bug: a página carregava uma fatia dos 194 governadores, o Tarcísio
  // ficava de fora, e a lista inteira — presidenciáveis inclusive — aparecia
  // como adversária possível.
  const candidatos = [
    { slug: 'lula-pt-br', position: 'PRESIDENTE', state: 'BR' },
    { slug: 'zema-novo-br', position: 'PRESIDENTE', state: 'BR' },
  ]
  assert.deepEqual(eligibleOpponents(candidatos, 'tarcisio-sp'), [])

  // Resolvido por fora (pela ficha), o recorte volta a funcionar.
  assert.deepEqual(
    eligibleOpponents(candidatos, { position: 'PRESIDENTE', state: 'BR' }).map((c) => c.slug),
    ['lula-pt-br', 'zema-novo-br'],
  )
})
