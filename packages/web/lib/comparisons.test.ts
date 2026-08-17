import assert from 'node:assert/strict'
import test from 'node:test'
import { buildComparisonSlug,
  eligibleOpponents,
} from './comparisons'

test('builds one deterministic URL for a candidate pair regardless of selection order', () => {
  assert.equal(buildComparisonSlug('zema-novo-mg', 'lula-pt-sp'), 'lula-pt-sp-x-zema-novo-mg')
  assert.equal(buildComparisonSlug('lula-pt-sp', 'zema-novo-mg'), 'lula-pt-sp-x-zema-novo-mg')
  assert.throws(() => buildComparisonSlug('lula-pt-sp', 'lula-pt-sp'))
})

test('só oferece adversário do mesmo cargo depois da primeira escolha', () => {
  const candidatos = [
    { slug: 'lula-pt-br', position: 'PRESIDENTE' },
    { slug: 'zema-novo-br', position: 'PRESIDENTE' },
    { slug: 'alan-rick-ac', position: 'GOVERNADOR' },
    { slug: 'eudo-pcb-ac', position: 'SENADOR' },
  ]

  // Sem escolha ainda, tudo é elegível.
  assert.equal(eligibleOpponents(candidatos, undefined).length, 4)

  // Escolhido um presidenciável, governador e senador saem da lista.
  assert.deepEqual(
    eligibleOpponents(candidatos, 'lula-pt-br').map((c) => c.slug),
    ['lula-pt-br', 'zema-novo-br'],
  )

  assert.deepEqual(
    eligibleOpponents(candidatos, 'alan-rick-ac').map((c) => c.slug),
    ['alan-rick-ac'],
  )
})
