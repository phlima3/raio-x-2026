// Regra 4 do BRIEF.md, aplicada devagar (a API limita 100 requisições/min).
// Presidenciáveis fora das duplas em ordem de urna; depois Senado e governo
// em ordem alfabética do nome de urna (pt-BR). Para no primeiro com votações.
// Uso: NODE_USE_ENV_PROXY=1 node scripts/regra4.mjs
import { writeFileSync } from 'node:fs'

const API = 'https://api.raio-x-2026.com.br/api/candidates'
const PAIRS = new Set([
  'luiz-inacio-lula-da-silva-pt-sp',
  'flavio-bolsonaro-pl-rj',
  'renan-santos-missao-sp',
  'augusto-jorge-cury-avante-br-presidente-2026',
])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nome = (c) => c.socialName?.trim() || c.name

async function get(url) {
  for (;;) {
    await wait(800)
    const r = await fetch(url)
    const j = await r.json().catch(() => null)
    if (j?.success) return j
    console.log(`  ${r.status} em ${url}; espero a janela do limite`)
    await wait(65_000)
  }
}

async function list(position) {
  const all = []
  for (let page = 1; ; page++) {
    const j = await get(`${API}?position=${position}&limit=100&page=${page}`)
    all.push(...j.data)
    if (j.data.length === 0 || all.length >= j.meta.total) break
  }
  return all
}

const log = []
async function scan(label, candidates) {
  for (const c of candidates) {
    const j = await get(`${API}/${c.slug}`)
    const n = (j.data.votingRecords ?? []).length
    log.push({ grupo: label, nome: nome(c), slug: c.slug, votos: n })
    if (n > 0) return { grupo: label, nome: nome(c), slug: c.slug, votos: n }
  }
  return null
}

const presidents = (await list('PRESIDENTE'))
  .filter((c) => !PAIRS.has(c.slug))
  .sort((a, b) => (a.ballotNumber ?? Infinity) - (b.ballotNumber ?? Infinity))
let chosen = await scan('presidência (número de urna)', presidents)
if (!chosen) {
  const senate = (await list('SENADOR')).sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))
  chosen = await scan('senado (alfabética)', senate)
}
if (!chosen) {
  const gov = (await list('GOVERNADOR')).sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))
  chosen = await scan('governo (alfabética)', gov)
}
writeFileSync(
  new URL('../capture/data/regra4.json', import.meta.url),
  JSON.stringify({ em: new Date().toISOString(), escolhida: chosen, verificadas: log }, null, 1),
)
console.log('verificadas:', log.length, 'escolhida:', JSON.stringify(chosen))
