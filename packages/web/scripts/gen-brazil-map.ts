/**
 * Gera lib/brazilMap.ts a partir da malha oficial de UFs do IBGE.
 *
 *   pnpm --filter @raiox/web run gen:map
 *
 * Projeção Mercator simples, normalizada num viewBox de 1000 de largura.
 * ponytail: rodar à mão quando a malha do IBGE mudar — não é build step.
 */
const MALHA_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF'

// Códigos de UF do IBGE (codarea) → sigla
const UF_BY_CODE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

type Ring = [number, number][]
type Feature = {
  properties: { codarea: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] }
}

const WIDTH = 1000

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

function ringsOf(f: Feature): Ring[] {
  return f.geometry.type === 'Polygon'
    ? (f.geometry.coordinates as Ring[])
    : (f.geometry.coordinates as Ring[][]).flat()
}

async function main() {
  const res = await fetch(MALHA_URL)
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`)
  const { features } = (await res.json()) as { features: Feature[] }

  // Projeta tudo primeiro para achar o bounding box comum.
  const projected = features.map((f) => ({
    uf: UF_BY_CODE[f.properties.codarea],
    rings: ringsOf(f).map((r) => r.map(([lon, lat]) => [(lon * Math.PI) / 180, -mercatorY(lat)] as const)),
  }))

  const missing = projected.filter((p) => !p.uf)
  if (missing.length) throw new Error('codarea desconhecido na malha do IBGE')

  const all = projected.flatMap((p) => p.rings.flat())
  const minX = Math.min(...all.map((p) => p[0]))
  const maxX = Math.max(...all.map((p) => p[0]))
  const minY = Math.min(...all.map((p) => p[1]))
  const maxY = Math.max(...all.map((p) => p[1]))
  const scale = WIDTH / (maxX - minX)
  const height = Math.round((maxY - minY) * scale)

  const round = (n: number) => Math.round(n * 10) / 10
  const paths = projected
    .map((p) => {
      const d = p.rings
        .map((ring) => {
          const pts = ring
            .map(([x, y]) => `${round((x - minX) * scale)} ${round((y - minY) * scale)}`)
            .filter((pt, i, arr) => pt !== arr[i - 1])
          return 'M' + pts.join('L') + 'Z'
        })
        .join('')
      return `  ${p.uf}: '${d}',`
    })
    .sort()
    .join('\n')

  const out = `// GERADO POR scripts/gen-brazil-map.ts — não editar à mão.
// Fonte: malha de UFs do IBGE (qualidade mínima), projeção Mercator.
export const BRAZIL_VIEWBOX = '0 0 ${WIDTH} ${height}'

export const BRAZIL_UF_PATHS: Record<string, string> = {
${paths}
}
`
  await (await import('node:fs/promises')).writeFile(
    new URL('../lib/brazilMap.ts', import.meta.url),
    out
  )
  console.log(`lib/brazilMap.ts: ${projected.length} UFs, ${(out.length / 1024).toFixed(1)} kB`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
