// Gera index.html a partir do que foi capturado do site em produção.
//
// Tudo o que é número ou texto do site vem de capture/data (JSON gravado pela
// captura de 26/09/2026). As duas duplas do comparador saem da mesma função
// `dupla()`: mesmo tamanho, mesmo tempo, mesmo movimento, lado A e lado B
// sempre juntos.
//
// Uso: node scripts/build.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const json = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'))
/** Largura e altura de um PNG, lidas do cabeçalho IHDR. */
function pngSize(rel) {
  const b = readFileSync(path.join(ROOT, rel))
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ——— Dados capturados ————————————————————————————————————————————

const home = json('capture/data/home.json')
const api = json('capture/data/api-presidentes.json').data
const medidas = json('capture/data/comparar-medidas.json')

const HOOK_LINES = ['Quem são, o que', 'propõem, como', 'votaram.']
if (HOOK_LINES.join(' ') !== home.hero.h1) throw new Error(`h1 mudou: ${home.hero.h1}`)
const LEAD = home.hero.lead.split(/(?<=\.)\s+/)[0] // "13 nomes registrados no TSE para a Presidência."
const bySlug = Object.fromEntries(api.map((c) => [c.slug, c]))
const presidents = home.presidents
  .map((p) => ({ ...p, number: Number(p.ballotNumber), c: bySlug[p.slug] }))
  .sort((a, b) => a.number - b.number)

/** Nome de urna, como o título da ficha (`nomeConhecido`). */
const nomeDeUrna = (slug) => bySlug[slug].socialName?.trim() || bySlug[slug].name
/** Partido como a imprensa escreve; presidenciável fica só com o partido (`partyLabel`). */
const partido = (slug) => bySlug[slug].party

/** As cifras do bloco de fundo eleitoral, exatamente como o comparador escreveu. */
function fundo(tag) {
  const cap = json(`capture/data/comparar-${tag}-640.json`)
  const parts = cap.info.financing.split(/\n+/).map((s) => s.trim())
  const cols = []
  parts.forEach((p, i) => {
    if (/^\d+(,\d+)?%$/.test(p)) {
      cols.push({ share: p, value: parts[i + 2], of: parts[i + 3] })
    }
  })
  const dates = [...cap.info.financing.matchAll(/ATUALIZADA EM (\d\d\/\d\d\/\d{4})/g)].map((m) => m[1])
  const years = [...cap.info.financing.matchAll(/PRESTAÇÃO DE (\d{4})/g)].map((m) => m[1])
  if (cols.length !== 2 || dates.length !== 2) throw new Error(`fundo eleitoral incompleto em ${tag}`)
  return cols.map((c, i) => ({ ...c, source: `Prestação de ${years[i]}, atualizada em ${dates[i]}` }))
}

// Mapa do Brasil do site (lib/brazilMap.ts), as 27 UFs.
const mapSrc = readFileSync(path.join(ROOT, '..', 'packages/web/lib/brazilMap.ts'), 'utf8')
const MAP_VIEWBOX = mapSrc.match(/BRAZIL_VIEWBOX = '([^']+)'/)[1]
const MAP_PATHS = [...mapSrc.matchAll(/^\s+([A-Z]{2}): '([^']+)'/gm)].map((m) => m[2])
if (MAP_PATHS.length !== 27) throw new Error(`mapa: ${MAP_PATHS.length} UFs`)

// ——— Geometria (px do quadro 1080x1920) ——————————————————————————

const M = 108 // margem lateral (área de título, 10%)
const COL_W = 410
const COL_B = 562 // M + COL_W + 44
const PANEL = { x: 160, y: 480, w: 760 }
const CELL = { w: 187.5, h: 250, gap: 2, border: 2 }
const HOME_SCROLL = 1700 // do gancho até o painel
const PAIR_SCROLL = 1580 // do fundo eleitoral até as propostas (abaixo da dobra até rolar)
const CROP_SCALE = COL_W / 280 // a coluna do comparador tem 280 px CSS a 640 px de largura

const cellPos = (i) => {
  const c = i % 4
  const r = Math.floor(i / 4)
  return {
    x: PANEL.x + CELL.border + c * (CELL.w + CELL.gap),
    y: PANEL.y + CELL.border + r * (CELL.h + CELL.gap),
  }
}
const HEAD = { a: { x: M, y: 430 }, b: { x: COL_B, y: 430 }, s: 180 / CELL.w }
const ROW = { a: { x: M, y: 290 }, b: { x: COL_B, y: 290 }, s: 66 / CELL.w }

// ——— Pedaços de marcação ————————————————————————————————————————

/** Palavras que acendem: cada uma nasce em #c9c1ad e vai para a cor final. */
const words = (text, cls = '', color = 'ink') =>
  text
    .split(' ')
    .map((w) => `<span class="w ${cls}" data-to="${color}" data-layout-allow-overlap>${esc(w)}</span>`)
    .join(' ')

const photo = (p) =>
  p.photoSrc
    ? `<img src="assets/photos/urna-${p.number}.jpg" alt="" />`
    : ''

const badge = (p) => `<span class="badge">${p.number}</span>`

const PAIR_SLUGS = [
  ['luiz-inacio-lula-da-silva-pt-sp', 'flavio-bolsonaro-pl-rj'],
  ['renan-santos-missao-sp', 'augusto-jorge-cury-avante-br-presidente-2026'],
]
const FLYING = new Set(PAIR_SLUGS.flat())

function panel() {
  const cells = presidents
    .map((p, i) => {
      const { x, y } = cellPos(i)
      const inner = FLYING.has(p.slug) ? '' : `${photo(p)}${badge(p)}`
      return `<li class="cell" style="left:${x - PANEL.x}px;top:${y - PANEL.y}px">${inner}</li>`
    })
    .join('\n          ')
  const last = cellPos(presidents.length)
  const noteW = PANEL.w - CELL.border - (last.x - PANEL.x)
  return `<ol id="panel" style="left:${PANEL.x}px;top:${PANEL.y + HOME_SCROLL}px;width:${PANEL.w}px;height:${
    4 * CELL.h + 3 * CELL.gap + 2 * CELL.border
  }px">
          ${cells}
          <li class="note" style="left:${last.x - PANEL.x}px;top:${last.y - PANEL.y}px;width:${noteW}px">${esc(
    home.sheetNote,
  )}</li>
        </ol>`
}

function flyingPhotos() {
  return presidents
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => FLYING.has(p.slug))
    .map(({ p, i }) => {
      const { x, y } = cellPos(i)
      return `<div id="f${p.number}" class="fly" data-layout-allow-overflow style="left:${x}px;top:${y}px">${photo(p)}${badge(p)}</div>`
    })
    .join('\n      ')
}

function dupla(k, tag, [slugA, slugB]) {
  const id = `d${k}`
  const fin = fundo(tag)
  const med = medidas[tag]
  const crop = (side, i) => {
    const m = med[i]
    const file = `assets/captures/dupla${k}-${side}-proposta.png`
    const px = pngSize(file)
    const w = (px.w / 3) * CROP_SCALE
    const x = side === 'a' ? M : COL_B
    const box = (r, cls) =>
      `<i class="callout ${cls}" style="left:${(x + r.x * CROP_SCALE - 7).toFixed(1)}px;top:${(
        r.y * CROP_SCALE - 6
      ).toFixed(1)}px;width:${(r.w * CROP_SCALE + 14).toFixed(1)}px;height:${(r.h * CROP_SCALE + 12).toFixed(1)}px"></i>`
    return {
      h: (px.h / 3) * CROP_SCALE,
      html: `<img class="crop" src="${file}" alt="" style="left:${x}px;width:${w.toFixed(1)}px" />
          ${box(m.ia, 'ia')}
          ${box(m.link, 'link')}`,
    }
  }
  const ca = crop('a', 0)
  const cb = crop('b', 1)
  const winH = Math.ceil(Math.max(ca.h, cb.h))
  const TABS_Y = 400 + PAIR_SCROLL
  const WIN_Y = 540 + PAIR_SCROLL
  const CAP_Y = WIN_Y + winH + 38
  const temas = json(`capture/data/comparar-${tag}-640.json`).info.tabs.map((t) => t.theme)
  const col = (side, slug, f) => {
    const x = side === 'a' ? M : COL_B
    return `
        <div class="col side-${side}">
        <div class="namebox" style="left:${x}px">
          <div class="name serif">${words(nomeDeUrna(slug))}</div>
          <div class="party">${words(partido(slug), '', 'muted')}</div>
        </div>
        <div class="fefc" style="left:${x}px">
          <p class="share serif">${words(f.share)}</p>
          <p class="of-total">${words('da arrecadação', '', 'muted')}</p>
          <p class="value">${words(f.value)}</p>
          <p class="received">${words(f.of, '', 'muted')}</p>
          <p class="source">${words(f.source, '', 'muted')}</p>
        </div>
        </div>`
  }
  return `
    <section id="s-${id}" class="clip" data-start="${k === 1 ? 5 : 12.5}" data-duration="7" data-track-index="2">
      <div id="${id}-fade" class="layer fade0">
        <div id="${id}-page" class="layer" data-layout-allow-overflow>
          <h2 class="pair-title serif">${words('Lado a lado')}</h2>
          ${col('a', slugA, fin[0])}
          ${col('b', slugB, fin[1])}
          <div class="rule" style="top:862px"></div>
          <p class="fefc-label">${words('Fundo eleitoral, dinheiro público', '', 'muted')}</p>
          <div class="divider" style="top:936px;height:360px"></div>
          <div class="rule" style="top:1310px"></div>
          <div id="${id}-tabs" class="tabs" style="top:${TABS_Y}px">
            <span class="tema">Tema</span>
            ${temas
              .map((t) => `<span class="tab"${t === 'Economia' ? ` id="${id}-tab-ativa"` : ''}>${esc(t)}</span>`)
              .join('\n            ')}
            <i id="${id}-sublinhado" class="underline"></i>
          </div>
          <div class="window" style="top:${WIN_Y}px;height:${winH}px">
            <div class="divider" style="left:${(M + COL_W + COL_B) / 2 - 1}px;top:0;height:${winH}px"></div>
          ${ca.html}
          ${cb.html}
          </div>
          <p class="caption serif" style="top:${CAP_Y}px">${words(
            'Resumo por IA, com o link para o plano de governo no TSE.',
          )}</p>
        </div>
        <div id="${id}-sticky" class="layer fade0">
          <div class="sticky-name serif" style="left:${M + 66 + 20}px">${esc(nomeDeUrna(slugA))}</div>
          <div class="sticky-name serif" style="left:${COL_B + 66 + 20}px">${esc(nomeDeUrna(slugB))}</div>
        </div>
      </div>
    </section>`
}

// ——— Recortes da ficha e da home ——————————————————————————————————

const S5 = 864 / 398 // a ficha no celular (430 px) tem 398 px de conteúdo
const S6 = S5
const S7 = 832 / 398 // a busca fica na metade de baixo: termina em x = 940, longe dos botões dos Reels
const ficha = json('capture/data/ficha-hertz-430.json')
const VOTOS_TABS = ficha.info.tabs.map((t) => t.split(':')[0]) // Votações, Patrimônio, Financiamento
if (VOTOS_TABS[0] !== 'Votações') throw new Error(`abas da ficha: ${VOTOS_TABS}`)
const VAZIO = pngSize('assets/captures/ficha-votacoes-vazio.png')
const FONTE = pngSize('assets/captures/ficha-situacao-fonte.png')
const BUSCA = pngSize('assets/captures/home-busca.png')
const linkBottom = ((279 - 66) / 3) * S6 // fim do texto do link dentro do recorte (medido na captura)
const mapa = `<svg class="map" viewBox="${MAP_VIEWBOX}" aria-hidden="true">${MAP_PATHS.map(
  (d) => `<path d="${d}"/>`,
).join('')}</svg>`

// ——— Documento ——————————————————————————————————————————————————

const html = `<!doctype html>
<html lang="pt-BR" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>Raio-X 2026, vídeo de 30 segundos</title>
    <!-- Gerado por scripts/build.mjs a partir de capture/data. Edite o gerador, não este arquivo. -->
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      @font-face {
        font-family: 'Bodoni Moda';
        src: url('assets/fonts/BodoniModa-latin.woff2') format('woff2');
        font-weight: 400 900;
        font-style: normal;
        font-display: block;
      }
      @font-face {
        font-family: 'Inter';
        src: url('assets/fonts/Inter-latin.woff2') format('woff2');
        font-weight: 400 700;
        font-style: normal;
        font-display: block;
      }
      :root {
        --paper: #f1ebdc;
        --paper-light: #f6f1e3;
        --paper-dark: #e6dec9;
        --ink: #1a1614;
        --muted: #554c45;
        --soft: #8a8079;
        --unlit: #c9c1ad;
        --ember: #b8321f;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--paper); }
      body {
        font-family: 'Inter', sans-serif;
        color: var(--ink);
        font-variant-numeric: tabular-nums;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      /* .paper-grain do site, na escala do quadro (1080 / 430 = 2,5x) */
      .ground {
        position: absolute;
        inset: 0;
        background-color: var(--paper);
        background-image:
          radial-gradient(rgba(26, 22, 20, 0.035) 2.5px, transparent 2.5px),
          radial-gradient(rgba(26, 22, 20, 0.025) 2.5px, transparent 2.5px);
        background-size: 8px 8px, 18px 18px;
        background-position: 0 0, 3px 5px;
      }
      .clip, .layer { position: absolute; inset: 0; }
      .fade0 { opacity: 0; }
      .serif {
        font-family: 'Bodoni Moda', serif;
        font-weight: 400;
        font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
      }
      .w { color: var(--unlit); display: inline-block; }
      .w svg { fill: currentColor; }

      /* Gancho e painel (a home no celular) */
      #hook { position: absolute; left: ${M}px; top: 600px; width: 864px; font-size: 116px; line-height: 1; letter-spacing: -0.02em; font-variation-settings: 'opsz' 42; }
      #hook .line { display: block; }
      #turno { position: absolute; left: ${M}px; top: 1010px; font-size: 46px; line-height: 1.3; }
      #lead { position: absolute; left: ${M}px; top: ${300 + HOME_SCROLL}px; width: 864px; font-size: 64px; line-height: 1.12; letter-spacing: -0.015em; font-variation-settings: 'opsz' 23; }
      #panel { position: absolute; list-style: none; background: var(--ink); }
      #panel .cell, #panel .note { position: absolute; width: ${CELL.w}px; height: ${CELL.h}px; overflow: hidden; background: var(--paper-dark); }
      #panel .note {
        background: var(--paper);
        display: flex;
        align-items: flex-end;
        padding: 26px 28px;
        font-size: 26px;
        line-height: 1.35;
        color: var(--muted);
      }
      .cell img, .fly img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
      .badge {
        position: absolute;
        left: 0;
        bottom: 0;
        z-index: 2;
        background: var(--ink);
        color: var(--paper);
        font-size: 25px;
        font-weight: 600;
        line-height: 1.25;
        padding: 3px 15px;
      }
      .fly {
        position: absolute;
        width: ${CELL.w}px;
        height: ${CELL.h}px;
        overflow: hidden;
        background: var(--paper-dark);
        transform-origin: 0 0;
      }

      /* Comparador */
      .pair-title { position: absolute; left: ${M}px; top: 286px; font-size: 84px; line-height: 1; letter-spacing: -0.02em; font-variation-settings: 'opsz' 30; }
      .namebox { position: absolute; top: 690px; width: ${COL_W}px; }
      .name { font-size: 46px; line-height: 1.06; letter-spacing: -0.01em; font-variation-settings: 'opsz' 17; }
      .party { margin-top: 14px; font-size: 28px; line-height: 1.2; }
      .rule { position: absolute; left: ${M}px; width: 864px; height: 2px; background: var(--ink); }
      .divider { position: absolute; left: ${(M + COL_W + COL_B) / 2 - 1}px; width: 2px; background: rgba(26, 22, 20, 0.12); }
      .fefc-label { position: absolute; left: ${M}px; top: 884px; font-size: 30px; line-height: 1.2; }
      .fefc { position: absolute; top: 940px; width: 378px; }
      .fefc p { display: block; }
      .share { font-size: 132px; line-height: 1; letter-spacing: -0.03em; font-variation-settings: 'opsz' 48; }
      .of-total { margin-top: 12px; font-size: 28px; line-height: 1.2; }
      .value { margin-top: 22px; font-size: 38px; font-weight: 500; line-height: 1.2; }
      .received { margin-top: 6px; font-size: 26px; line-height: 1.25; }
      .source { margin-top: 14px; font-size: 22px; line-height: 1.3; }
      .tabs {
        position: absolute;
        left: ${M}px;
        width: 864px;
        padding: 10px 0 12px;
        border-top: 2px solid rgba(26, 22, 20, 0.2);
        border-bottom: 2px solid rgba(26, 22, 20, 0.2);
        display: flex;
        flex-wrap: wrap;
        column-gap: 34px;
        row-gap: 4px;
        font-size: 28px;
        line-height: 1.7;
        color: var(--muted);
      }
      .tabs .tema { color: var(--soft); }
      .underline { position: absolute; left: 0; top: 0; width: 0; height: 3px; background: var(--ember); transform-origin: 0 50%; }
      .window { position: absolute; left: 0; width: 1080px; background: var(--paper-light); border-bottom: 2px solid rgba(26, 22, 20, 0.2); }
      .window .crop { position: absolute; top: 0; display: block; }
      .callout { position: absolute; border: 3px solid var(--ink); opacity: 0; }
      .caption { position: absolute; left: ${M}px; width: 832px; font-size: 50px; line-height: 1.14; letter-spacing: -0.01em; font-variation-settings: 'opsz' 18; }
      .sticky-name { position: absolute; top: 292px; width: 300px; font-size: 36px; line-height: 1.05; letter-spacing: -0.01em; font-variation-settings: 'opsz' 13; }

      /* Ficha, fontes e fecho */
      .scene-title { position: absolute; left: ${M}px; top: 300px; font-size: 84px; line-height: 1; letter-spacing: -0.02em; font-variation-settings: 'opsz' 30; }
      #frase { position: absolute; left: ${M}px; top: 300px; width: 864px; font-size: 76px; line-height: 1.18; letter-spacing: -0.015em; font-variation-settings: 'opsz' 27; }
      .map { display: inline-block; height: 1.25em; width: auto; vertical-align: -0.28em; margin: 0 0.06em; }
      #fonte-sublinhado { position: absolute; height: 4px; background: var(--ember); transform-origin: 0 50%; }
      #logo { position: absolute; left: ${M}px; top: 580px; display: flex; align-items: baseline; gap: 22px; }
      /* o desenho do wordmark do Navbar (text-[1.75rem] e text-base), ampliado */
      #logo .rx { font-size: 168px; line-height: 1; letter-spacing: -0.02em; font-variation-settings: 'opsz' 28; }
      #logo .ano { font-size: 72px; line-height: 1; font-variation-settings: 'opsz' 16; }
      #rodape { position: absolute; left: ${M}px; top: 818px; font-size: 44px; line-height: 1.25; }
      #url { position: absolute; left: ${M}px; top: 1178px; font-size: 50px; font-weight: 500; line-height: 1.2; letter-spacing: -0.01em; }

      /* Barra de progresso do Navbar */
      #cabecalho {
        position: absolute;
        left: 0;
        top: 0;
        width: 1080px;
        height: 250px;
        background-color: var(--paper);
        background-image:
          radial-gradient(rgba(26, 22, 20, 0.035) 2.5px, transparent 2.5px),
          radial-gradient(rgba(26, 22, 20, 0.025) 2.5px, transparent 2.5px);
        background-size: 8px 8px, 18px 18px;
        background-position: 0 0, 3px 5px;
      }
      #topbar .hair { position: absolute; left: 0; top: 249px; width: 1080px; height: 2px; background: var(--ink); }
      #progress { position: absolute; left: 0; top: 247px; width: 1080px; height: 6px; background: var(--ember); transform-origin: 0 50%; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="30"
      data-fps="30"
      data-width="1080"
      data-height="1920"
    >
      <div class="ground" aria-hidden="true"></div>

      <section id="s-home" class="clip" data-start="0" data-duration="20.6" data-track-index="1">
        <div id="home-fade" class="layer">
          <div id="home-page" class="layer" data-layout-allow-overflow>
            <h1 id="hook" class="serif">
              ${HOOK_LINES.map((l) => `<span class="line">${words(l)}</span>`).join('\n              ')}
            </h1>
            <p id="turno">${words('1º turno em', '', 'muted')} <span class="w" data-to="ember" data-layout-allow-overlap style="font-weight:500">4&nbsp;de&nbsp;outubro.</span></p>
            <p id="lead" class="serif">${words(LEAD)}</p>
            ${panel()}
          </div>
        </div>
      </section>
${dupla(1, 'luiz-flavio', PAIR_SLUGS[0])}
${dupla(2, 'renan-augusto', PAIR_SLUGS[1])}

      <section id="s-votos" class="clip" data-start="20" data-duration="3" data-track-index="3">
        <div id="votos-fade" class="layer fade0">
          <h2 class="scene-title serif">${words('Como votaram')}</h2>
          <div id="votos-tabs" class="tabs" style="top:430px">
            <span class="tema">Dados</span>
            ${VOTOS_TABS.map((t) => `<span class="tab"${t === 'Votações' ? ' id="votos-tab-ativa"' : ''}>${esc(t)}</span>`).join('\n            ')}
            <i id="votos-sublinhado" class="underline"></i>
          </div>
          <img src="assets/captures/ficha-votacoes-vazio.png" alt="" style="position:absolute;left:${M}px;top:566px;width:${((VAZIO.w / 3) * S5).toFixed(1)}px" />
        </div>
      </section>

      <section id="s-fontes" class="clip" data-start="22.5" data-duration="4" data-track-index="3">
        <div id="fontes-fade" class="layer fade0">
          <p id="frase" class="serif">${words('Em todo o país')} <span class="w" data-to="ink" data-layout-allow-overlap>${mapa}</span> ${words(
            'direto do TSE, da Câmara e do Senado. Cada dado com a',
          )} <span id="palavra-fonte" class="w" data-to="ink" data-layout-allow-overlap>fonte</span> ${words('ao lado.')}</p>
          <img src="assets/captures/ficha-situacao-fonte.png" alt="" style="position:absolute;left:${M}px;top:740px;width:${((FONTE.w / 3) * S6).toFixed(1)}px" />
          <i id="fonte-sublinhado" style="left:${M}px;top:${(740 + linkBottom + 7).toFixed(1)}px;width:${((1179 / 3) * S6).toFixed(1)}px"></i>
        </div>
      </section>

      <section id="s-fecho" class="clip" data-start="26" data-duration="4" data-track-index="3">
        <div id="fecho-fade" class="layer fade0">
          <div id="logo" class="serif"><span class="w rx" data-to="ink" data-layout-allow-overlap>Raio-X</span><span class="w ano" data-to="ember" data-layout-allow-overlap>2026</span></div>
          <p id="rodape">${words(home.footer.replace(/^©\s*\d{4}\s*Raio-X 2026\.\s*/, ''), '', 'muted')}</p>
          <img src="assets/captures/home-busca.png" alt="" style="position:absolute;left:${M}px;top:944px;width:${((BUSCA.w / 3) * S7).toFixed(1)}px" />
          <p id="url">${words('raio-x-2026.com.br')}</p>
        </div>
      </section>

      <div id="fly" class="clip" data-start="0" data-duration="20.6" data-track-index="4">
      ${flyingPhotos()}
      </div>

      <div id="topbar" class="clip" data-start="0" data-duration="30" data-track-index="5">
        <div id="cabecalho"></div>
        <div class="hair"></div>
        <div id="progress"></div>
      </div>

      <audio id="a-trilha" src="assets/audio/trilha.wav" data-start="0" data-duration="30" data-track-index="10" data-volume="1"></audio>
      <audio id="a-whoosh-1" src="assets/audio/sfx-whoosh-short.mp3" data-start="5" data-duration="0.57" data-track-index="11" data-volume="0.3"></audio>
      <audio id="a-whoosh-2" src="assets/audio/sfx-whoosh-short.mp3" data-start="11.5" data-duration="0.57" data-track-index="11" data-volume="0.3"></audio>
      <audio id="a-whoosh-3" src="assets/audio/sfx-whoosh-short.mp3" data-start="12.5" data-duration="0.57" data-track-index="11" data-volume="0.3"></audio>
      <audio id="a-whoosh-4" src="assets/audio/sfx-whoosh-short.mp3" data-start="19" data-duration="0.57" data-track-index="11" data-volume="0.3"></audio>
      <audio id="a-clique-1" src="assets/audio/sfx-click-soft.mp3" data-start="8.4" data-duration="0.36" data-track-index="12" data-volume="0.6"></audio>
      <audio id="a-clique-2" src="assets/audio/sfx-click-soft.mp3" data-start="15.9" data-duration="0.36" data-track-index="12" data-volume="0.6"></audio>
      <audio id="a-clique-3" src="assets/audio/sfx-click-soft.mp3" data-start="20.5" data-duration="0.36" data-track-index="12" data-volume="0.6"></audio>
    </div>

    <script>
      // A curva do site: cubic-bezier(0.22, 1, 0.36, 1), resolvida como no navegador.
      function cubicBezier(p1x, p1y, p2x, p2y) {
        const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx
        const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by
        const sx = (t) => ((ax * t + bx) * t + cx) * t
        const sy = (t) => ((ay * t + by) * t + cy) * t
        const dx = (t) => (3 * ax * t + 2 * bx) * t + cx
        const solve = (x) => {
          let t = x
          for (let i = 0; i < 8; i++) {
            const e = sx(t) - x
            if (Math.abs(e) < 1e-7) return t
            const d = dx(t)
            if (Math.abs(d) < 1e-7) break
            t -= e / d
          }
          let lo = 0, hi = 1
          t = x
          for (let i = 0; i < 40; i++) {
            const v = sx(t)
            if (Math.abs(v - x) < 1e-7) break
            if (x > v) lo = t
            else hi = t
            t = (lo + hi) / 2
          }
          return t
        }
        return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)))
      }
      const SITE = cubicBezier(0.22, 1, 0.36, 1)
      const COLORS = { ink: '#1a1614', muted: '#554c45', soft: '#8a8079', ember: '#b8321f' }
      const UNLIT = '#c9c1ad'
      const $$ = (sel) => Array.from(document.querySelectorAll(sel))

      const HOME_SCROLL = ${HOME_SCROLL}
      const PAIR_SCROLL = ${PAIR_SCROLL}
      const BASE = ${JSON.stringify(
        Object.fromEntries(
          presidents
            .map((p, i) => [p, i])
            .filter(([p]) => FLYING.has(p.slug))
            .map(([p, i]) => [`f${p.number}`, cellPos(i)]),
        ),
      )}
      const HEAD = ${JSON.stringify(HEAD)}
      const ROW = ${JSON.stringify(ROW)}

      function build() {
        const tl = gsap.timeline({ paused: true })

        // A palavra acende: do cinza para a cor final, linear, como .reveal-word.
        const light = (els, t, step, dur = 0.25) =>
          els.forEach((el, i) =>
            tl.fromTo(
              el,
              { color: UNLIT },
              { color: COLORS[el.dataset.to] || COLORS.ink, duration: dur, ease: 'none', immediateRender: false },
              t + i * step,
            ),
          )
        // Troca de página: o que sai e o que entra cruzam em 480 ms.
        const fade = (sel, from, to, t) =>
          tl.fromTo(sel, { opacity: from }, { opacity: to, duration: 0.48, ease: SITE, immediateRender: false }, t)
        // A foto passa de um lugar para o outro em 620 ms, como na View Transition.
        const move = (id, from, to, t) => {
          const b = BASE[id]
          tl.fromTo(
            '#' + id,
            { x: from.x - b.x, y: from.y - b.y, scale: from.s },
            { x: to.x - b.x, y: to.y - b.y, scale: to.s, duration: 0.62, ease: SITE, immediateRender: false },
            t,
          )
        }
        // A barra de progresso do Navbar cresce quando a página rola.
        const bar = (from, to, t) =>
          tl.fromTo('#progress', { scaleX: from }, { scaleX: to, duration: 0.6, ease: SITE, immediateRender: false }, t)

        tl.set('#progress', { scaleX: 0 }, 0)
        tl.set(['#d1-sublinhado', '#d2-sublinhado', '#votos-sublinhado'], { x: 0, y: 0, scaleX: 0 }, 0)
        tl.set('#fonte-sublinhado', { scaleX: 0 }, 0)
        // O sublinhado vermelho parte do canto da barra (left 0, top 0, largura 0)
        // e desliza até a aba ativa em 360 ms, como o indicador do comparador;
        // aqui em transform, para não travar em pixel inteiro.
        const slide = (prefix, t) => {
          const tab = document.getElementById(prefix + '-tab-ativa')
          const underline = document.getElementById(prefix + '-sublinhado')
          underline.style.width = tab.offsetWidth + 'px'
          tl.fromTo(
            underline,
            { x: 0, y: 0, scaleX: 0 },
            { x: tab.offsetLeft, y: tab.offsetTop + tab.offsetHeight - 6, scaleX: 1, duration: 0.36, ease: SITE, immediateRender: false },
            t,
          )
          tl.fromTo(tab, { color: COLORS.muted }, { color: COLORS.ember, duration: 0.2, ease: 'none', immediateRender: false }, t)
        }
        Object.keys(BASE).forEach((id) => tl.set('#' + id, { x: 0, y: HOME_SCROLL, scale: 1, opacity: 1 }, 0))

        // 1. Gancho: uma palavra por colcheia.
        light($$('#hook .w'), 0, 0.25)
        light($$('#turno .w'), 1.75, 0.08)

        // 2. A página rola até o painel.
        tl.fromTo('#home-page', { y: 0 }, { y: -HOME_SCROLL, duration: 0.6, ease: SITE, immediateRender: false }, 3.0)
        Object.keys(BASE).forEach((id) => {
          const b = BASE[id]
          move(id, { x: b.x, y: b.y + HOME_SCROLL, s: 1 }, { x: b.x, y: b.y, s: 1 }, 3.0)
        })
        bar(0, 0.12, 3.0)
        light($$('#lead .w'), 3.25, 0.125)

        // 3 e 4. As duplas: a mesma coreografia, os dois lados juntos.
        const PAIRS = [
          { id: 'd1', t0: 5.0, a: 'f13', b: 'f22', others: ['f14', 'f70'], p0: 0.12 },
          { id: 'd2', t0: 12.5, a: 'f14', b: 'f70', others: ['f13', 'f22'], p0: 0.32 },
        ]
        PAIRS.forEach(({ id, t0, a, b, others, p0 }) => {
          const page = '#' + id + '-page'
          // troca de página: painel sai, comparador entra, as fotos passam
          fade('#home-fade', 1, 0, t0)
          others.forEach((o) => fade('#' + o, 1, 0, t0))
          fade('#' + id + '-fade', 0, 1, t0)
          move(a, { ...BASE[a], s: 1 }, { ...HEAD.a, s: HEAD.s }, t0)
          move(b, { ...BASE[b], s: 1 }, { ...HEAD.b, s: HEAD.s }, t0)
          bar(p0, p0 + 0.1, t0)
          // acende de cima para baixo, A e B ao mesmo tempo
          light($$(page + ' .pair-title .w'), t0 + 0.5, 0.125)
          const both = (sel, t) => ['a', 'b'].forEach((s) => light($$(page + ' .side-' + s + ' ' + sel), t, 0))
          both('.name .w', t0 + 0.75)
          both('.party .w', t0 + 1.0)
          light($$(page + ' .fefc-label .w'), t0 + 1.25, 0.08)
          both('.share .w', t0 + 1.5)
          both('.of-total .w', t0 + 1.75)
          both('.value .w', t0 + 2.0)
          both('.received .w', t0 + 2.125)
          both('.source .w', t0 + 2.25)
          // rolagem até as propostas; as fotos viram o cabeçalho fixo
          tl.fromTo(page, { y: 0 }, { y: -PAIR_SCROLL, duration: 0.6, ease: SITE, immediateRender: false }, t0 + 3.0)
          move(a, { ...HEAD.a, s: HEAD.s }, { ...ROW.a, s: ROW.s }, t0 + 3.0)
          move(b, { ...HEAD.b, s: HEAD.s }, { ...ROW.b, s: ROW.s }, t0 + 3.0)
          tl.fromTo('#' + id + '-sticky', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: SITE, immediateRender: false }, t0 + 3.2)
          bar(p0 + 0.1, p0 + 0.2, t0 + 3.0)
          // o sublinhado vermelho desliza até Economia
          slide(id, t0 + 3.4)
          // o selo de IA e o link do TSE, nas duas colunas
          tl.fromTo($$(page + ' .callout'), { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none', immediateRender: false }, t0 + 5.0)
          light($$(page + ' .caption .w'), t0 + 5.0, 0.08)
          // volta ao painel
          fade('#' + id + '-fade', 1, 0, t0 + 6.5)
          fade('#home-fade', 0, 1, t0 + 6.5)
          others.forEach((o) => fade('#' + o, 0, 1, t0 + 6.5))
          move(a, { ...ROW.a, s: ROW.s }, { ...BASE[a], s: 1 }, t0 + 6.5)
          move(b, { ...ROW.b, s: ROW.s }, { ...BASE[b], s: 1 }, t0 + 6.5)
        })

        // 5. Como votaram: a aba Votações da ficha, como está.
        fade('#home-fade', 1, 0, 20.0)
        Object.keys(BASE).forEach((id) => fade('#' + id, 1, 0, 20.0))
        fade('#votos-fade', 0, 1, 20.0)
        bar(0.52, 0.66, 20.0)
        light($$('#s-votos .scene-title .w'), 20.25, 0.125)
        slide('votos', 20.5)

        // 6. De onde vem: a frase de "Sobre os dados" acende; o link de fonte ganha sublinhado.
        fade('#votos-fade', 1, 0, 22.5)
        fade('#fontes-fade', 0, 1, 22.5)
        bar(0.66, 0.8, 22.5)
        const frase = $$('#frase .w')
        light(frase, 22.6, 0.1)
        const tFonte = 22.6 + frase.indexOf(document.getElementById('palavra-fonte')) * 0.1
        tl.fromTo('#fonte-sublinhado', { scaleX: 0 }, { scaleX: 1, duration: 0.36, ease: SITE, immediateRender: false }, tFonte)

        // 7. Fecho (no início do compasso 14): logotipo, rodapé, busca e endereço. Segura até 30 s.
        fade('#fontes-fade', 1, 0, 26.0)
        fade('#fecho-fade', 0, 1, 26.0)
        bar(0.8, 1, 26.0)
        light($$('#logo .w'), 26.25, 0.25)
        light($$('#rodape .w'), 26.75, 0.125)
        light($$('#url .w'), 27.5, 0.1)

        tl.seek(0)
        return tl
      }

      Promise.all([
        document.fonts.load('400 116px "Bodoni Moda"'),
        document.fonts.load('400 28px "Inter"'),
        document.fonts.load('500 28px "Inter"'),
        document.fonts.load('600 25px "Inter"'),
      ]).then(() => {
        window.__timelines['main'] = build()
      })
    </script>
  </body>
</html>
`

writeFileSync(path.join(ROOT, 'index.html'), html)
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB, ${presidents.length} presidenciáveis, ${MAP_PATHS.length} UFs`)
