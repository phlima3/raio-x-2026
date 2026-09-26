// Captura o site de produção (https://raio-x-2026.com.br) com o Chromium do
// Playwright que vem no ambiente. Nada de seed, mock ou site local.
//
// Uso: node scripts/capture.mjs <etapa> [...args]
//   home                      home no layout de celular (430 px, DSF 3)
//   comparar <a> <b> <tema>   comparador lado a lado (largura >= 640 px)
//   ficha <slug>              ficha: situação eleitoral e aba Votações
//
// Medição de audiência fica bloqueada (Umami, Google Tag Manager/Analytics e
// o beacon de Web Vitals) para a captura não contar como visita.

import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'capture', 'raw')
const DATA = path.join(ROOT, 'capture', 'data')
const SITE = 'https://raio-x-2026.com.br'

const BLOCKED = /(cloud\.umami\.is|googletagmanager\.com|google-analytics\.com|\/api\/web-vitals)/
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'

async function open({ width, height = 932, dsf = 3, mobile = true }) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
      : undefined,
  })
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile ? MOBILE_UA : undefined,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'no-preference',
  })
  const blocked = []
  const failed = []
  await context.route(BLOCKED, (route) => {
    blocked.push(route.request().url())
    return route.abort()
  })
  const page = await context.newPage()
  page.on('requestfailed', (r) => {
    if (!BLOCKED.test(r.url())) failed.push(`${r.failure()?.errorText} ${r.url()}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') failed.push(`console: ${m.text()}`)
  })
  return { browser, page, blocked, failed }
}

async function settle(page, ms = 800) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/**
 * A produção às vezes devolve 502 num CSS ou numa fonte e a página sai crua.
 * Captura só vale com o estilo do site aplicado: fundo papel-claro no body e
 * Bodoni no h1. Senão recarrega (até 4 vezes).
 */
async function gotoStyled(page, url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' })
    await settle(page, 600)
    const ok = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor
      const h1 = document.querySelector('main h1')
      const serif = h1 ? getComputedStyle(h1).fontFamily : ''
      const bodoniLoaded = [...document.fonts].some((f) => /bodoni/i.test(f.family) && f.status === 'loaded')
      return bg === 'rgb(246, 241, 227)' && /bodoni/i.test(serif) && bodoniLoaded
    })
    if (ok && res.status() === 200) return res
    console.error(`  estilo não carregou (tentativa ${attempt}, status ${res.status()}); recarregando`)
    await page.waitForTimeout(3000 * attempt)
  }
  throw new Error(`o site não carregou com estilo: ${url}`)
}

async function shot(locator, name) {
  const file = path.join(RAW, `${name}.png`)
  await locator.screenshot({ path: file, animations: 'disabled' })
  const box = await locator.boundingBox()
  return { file: path.relative(ROOT, file), box }
}

async function home() {
  const { browser, page, blocked, failed } = await open({ width: 430 })
  const res = await gotoStyled(page, SITE + '/')
  await settle(page, 1200)

  const presidents = await page.$$eval(
    'ol[aria-label^="Candidatos à Presidência"] > li > a',
    (links) =>
      links.map((a) => {
        const img = a.querySelector('img')
        const spans = a.querySelectorAll('span')
        return {
          href: a.getAttribute('href'),
          slug: a.getAttribute('href').replace('/candidatos/', ''),
          photoSrc: img ? img.getAttribute('src') : null,
          ballotNumber: spans[0] ? spans[0].textContent.trim() : null,
          label: spans[1] ? spans[1].textContent.trim() : null,
        }
      }),
  )
  const sheetNote = await page
    .locator('ol[aria-label^="Candidatos à Presidência"] > li:last-child')
    .textContent()
  const hero = {
    h1: (await page.locator('main h1').first().textContent()).trim(),
    lead: (await page.locator('main h1 + p').first().textContent()).trim(),
    searchLabel: (await page.locator('label[for="q"]').textContent()).trim(),
    button: (await page.locator('form[action="/busca"] button').textContent()).trim(),
  }
  const sobre = await page.locator('section.reveal-scroll').evaluate((s) => ({
    words: [...s.querySelectorAll('.reveal-word')].map((w) => w.textContent.trim()),
    note: s.querySelector('p.mt-10')?.textContent.trim() ?? null,
  }))
  const footer = (await page.locator('footer[role="contentinfo"] > div:last-child p').textContent()).trim()

  const shots = {
    viewport: path.relative(ROOT, path.join(RAW, 'home-viewport.png')),
  }
  await page.screenshot({ path: path.join(RAW, 'home-viewport.png') })
  shots.h1 = await shot(page.locator('main h1').first(), 'home-h1')
  shots.search = await shot(page.locator('form[action="/busca"]'), 'home-search')
  shots.sheet = await shot(page.locator('ol[aria-label^="Candidatos à Presidência"]'), 'home-sheet')
  shots.navbar = await shot(page.locator('header[role="banner"]'), 'home-navbar')
  await page.screenshot({ path: path.join(RAW, 'home-full.png'), fullPage: true })

  const out = {
    url: page.url(),
    status: res.status(),
    capturedAt: new Date().toISOString(),
    viewport: { width: 430, dsf: 3 },
    hero,
    presidents,
    sheetNote: sheetNote.trim(),
    sobre,
    footer,
    shots,
    blocked,
    failed,
  }
  await writeFile(path.join(DATA, 'home.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ status: out.status, n: presidents.length, hero, blocked: blocked.length, failed }, null, 2))
  await browser.close()
}

async function comparar(a, b, tema, width = 720) {
  const { browser, page, blocked, failed } = await open({ width: Number(width), height: 1400 })
  const tag = `comparar-${a.split('-')[0]}-${b.split('-')[0]}-${width}`
  const url = `${SITE}/comparar?a=${a}&b=${b}` + (tema ? `&topic=${encodeURIComponent(tema)}` : '')
  const res = await gotoStyled(page, url)
  await page.locator('[data-cmp-header]').first().waitFor({ timeout: 90000 })
  await settle(page, 1500)

  const info = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tablist"] [data-theme]')].map((t) => ({
      theme: t.dataset.theme,
      selected: t.getAttribute('aria-selected') === 'true',
    }))
    const heads = [...document.querySelectorAll('[data-cmp-header]')].map((h) => h.innerText)
    const fin = document.querySelector('section[aria-label="Comparação de financiamento de campanha"]')
    const panel = document.querySelector('[role="tabpanel"]')
    return {
      pairLine: document.querySelector('main p.text-base')?.innerText ?? null,
      heads,
      tabs,
      financing: fin ? fin.innerText : null,
      panelTheme: panel?.getAttribute('aria-label') ?? null,
      panel: panel ? panel.innerText : null,
    }
  })

  const shots = {}
  await page.screenshot({ path: path.join(RAW, `${tag}-full.png`), fullPage: true })
  shots.full = path.relative(ROOT, path.join(RAW, `${tag}-full.png`))
  const heads = page.locator('[data-cmp-header]')
  shots.headA = await shot(heads.nth(0), `${tag}-head-a`)
  shots.headB = await shot(heads.nth(1), `${tag}-head-b`)
  const fin = page.locator('section[aria-label="Comparação de financiamento de campanha"]')
  if (await fin.count()) {
    shots.financing = await shot(fin, `${tag}-financing`)
    const cols = fin.locator(':scope > div').first().locator(':scope > div')
    shots.fefcA = await shot(cols.nth(0), `${tag}-fefc-a`)
    shots.fefcB = await shot(cols.nth(1), `${tag}-fefc-b`)
  }
  const tabs = page.locator('[role="tablist"][aria-label="Temas para comparação"]')
  if (await tabs.count()) shots.tabs = await shot(tabs, `${tag}-tabs`)
  const panel = page.locator('[role="tabpanel"] > div')
  if (await panel.count()) {
    shots.panel = await shot(panel, `${tag}-panel`)
    const cols = panel.locator(':scope > div')
    shots.colA = await shot(cols.nth(0), `${tag}-col-a`)
    shots.colB = await shot(cols.nth(1), `${tag}-col-b`)
    for (const side of ['a', 'b']) {
      const col = cols.nth(side === 'a' ? 0 : 1)
      const arts = col.locator('article')
      const n = await arts.count()
      shots[`articles_${side}`] = []
      for (let i = 0; i < n; i++) {
        const art = arts.nth(i)
        const meta = art.locator(':scope > div').last()
        shots[`articles_${side}`].push({
          article: await shot(art, `${tag}-${side}-art${i}`),
          title: await shot(art.locator('h4'), `${tag}-${side}-art${i}-title`),
          meta: await shot(meta, `${tag}-${side}-art${i}-meta`),
          text: await art.innerText(),
        })
      }
    }
  }
  const out = { url: page.url(), status: res.status(), capturedAt: new Date().toISOString(), viewport: { width: Number(width), dsf: 3 }, info, shots, blocked, failed }
  await writeFile(path.join(DATA, `${tag}.json`), JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ status: out.status, info: { ...info, panel: info.panel?.slice(0, 600), financing: info.financing?.slice(0, 900) }, blocked: blocked.length, failed }, null, 2))
  await browser.close()
}

async function ficha(slug, width = 430) {
  const { browser, page, blocked, failed } = await open({ width: Number(width), height: 1400 })
  const tag = `ficha-${slug.split('-')[0]}-${width}`
  const res = await gotoStyled(page, `${SITE}/candidatos/${slug}`)
  await settle(page, 1200)
  const shots = {}
  const info = await page.evaluate(() => {
    const dts = [...document.querySelectorAll('dt')]
    const sit = dts.find((d) => d.textContent.trim() === 'Situação eleitoral')
    const table = document.querySelector('#transparencia table')
    return {
      h1: document.querySelector('main h1')?.innerText ?? null,
      situacao: sit ? sit.parentElement.innerText : null,
      sourceHref: sit ? sit.parentElement.querySelector('a')?.getAttribute('href') ?? null : null,
      votingRows: table ? [...table.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()) : [],
      votingFooter: document.querySelector('#transparencia table')?.parentElement?.querySelector('p')?.innerText ?? null,
      tabs: [...document.querySelectorAll('#transparencia [role="tab"]')].map((t) => `${t.innerText}:${t.getAttribute('aria-selected')}`),
    }
  })
  const sit = page.locator('dt', { hasText: 'Situação eleitoral' }).locator('..')
  if (await sit.count()) {
    shots.situacao = await shot(sit, `${tag}-situacao`)
    const link = sit.locator('a')
    if (await link.count()) shots.sourceLink = await shot(link, `${tag}-fonte`)
  }
  // A seção usa `content-visibility: auto`: só renderiza perto da viewport.
  const transp = page.locator('#transparencia')
  await transp.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  shots.tabbar = await shot(page.locator('#transparencia [role="tablist"]'), `${tag}-abas`)
  const panel = page.locator('#transparencia [role="tabpanel"]')
  if (await panel.count()) {
    shots.votingPanel = await shot(panel, `${tag}-votacoes-painel`)
    info.votingPanel = await panel.innerText()
  }
  const table = page.locator('#transparencia table')
  if (await table.count()) {
    shots.table = await shot(table, `${tag}-votacoes`)
  }
  info.tabs = await page
    .locator('#transparencia [role="tab"]')
    .evaluateAll((ts) => ts.map((t) => `${t.textContent.trim()}:${t.getAttribute('aria-selected')}`))
  await page.screenshot({ path: path.join(RAW, `${tag}-full.png`), fullPage: true })
  const out = { url: page.url(), status: res.status(), capturedAt: new Date().toISOString(), viewport: { width: Number(width), dsf: 3 }, info, shots, blocked, failed }
  await writeFile(path.join(DATA, `${tag}.json`), JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ status: out.status, info: { ...info, votingRows: info.votingRows.slice(0, 12), nRows: info.votingRows.length }, blocked: blocked.length, failed }, null, 2))
  await browser.close()
}

await mkdir(RAW, { recursive: true })
await mkdir(DATA, { recursive: true })
const [step, ...args] = process.argv.slice(2)
if (step === 'home') await home()
else if (step === 'comparar') await comparar(...args)
else if (step === 'ficha') await ficha(...args)
else {
  console.error('etapa desconhecida: use home | comparar <a> <b> [tema] [largura] | ficha <slug> [largura]')
  process.exit(1)
}
