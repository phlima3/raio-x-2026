import assert from 'node:assert/strict'
import test from 'node:test'
import { BRAZIL_UF_PATHS, BRAZIL_VIEWBOX } from './brazilMap'
import { BRAZIL_STATES } from './landing'

function centroid(uf: string) {
  const points = BRAZIL_UF_PATHS[uf]
    .replace(/[MZ]/g, 'L')
    .split('L')
    .filter(Boolean)
    .map((pair) => pair.split(' ').map(Number))
  const avg = (i: number) => points.reduce((sum, p) => sum + p[i], 0) / points.length
  return { x: avg(0), y: avg(1) }
}

test('a malha do IBGE cobre exatamente as 27 unidades da federação', () => {
  const ufs = Object.keys(BRAZIL_UF_PATHS).sort()
  assert.deepEqual(ufs, Object.keys(BRAZIL_STATES).sort())
  for (const uf of ufs) {
    assert.match(BRAZIL_UF_PATHS[uf], /^M[\d. LMZ]+Z$/, `path inválido em ${uf}`)
  }
})

test('a projeção mantém a orientação geográfica do país', () => {
  const [, , width, height] = BRAZIL_VIEWBOX.split(' ').map(Number)
  assert.equal(width, 1000)
  assert.ok(height > 900 && height < 1200, `viewBox desproporcional: ${BRAZIL_VIEWBOX}`)

  // y cresce para o sul, x cresce para o leste.
  assert.ok(centroid('RR').y < centroid('RS').y, 'Roraima deveria estar ao norte do RS')
  assert.ok(centroid('AC').x < centroid('PB').x, 'Acre deveria estar a oeste da Paraíba')

  // O DF é um enclave goiano: os centroides têm de ficar praticamente juntos.
  const df = centroid('DF')
  const go = centroid('GO')
  assert.ok(Math.hypot(df.x - go.x, df.y - go.y) < 100, 'DF fora de Goiás')
})
