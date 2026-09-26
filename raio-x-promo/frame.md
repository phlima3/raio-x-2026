---
name: raio-x-2026-promo
source: "packages/web (tailwind.config.ts, app/globals.css, app/layout.tsx, components/Navbar.tsx, components/Footer.tsx)"
canvas: { width: 1080, height: 1920, fps: 30 }
colors:
  paper: "#f1ebdc"
  paper-light: "#f6f1e3"
  paper-dark: "#e6dec9"
  ink: "#1a1614"
  ink-muted: "#554c45"
  ink-soft: "#8a8079"
  unlit: "#c9c1ad"
  ember: "#b8321f"
typography:
  display: { family: "Bodoni Moda", file: assets/fonts/BodoniModa-latin.woff2, weight: 400, tracking: "-0.02em" }
  body: { family: "Inter", file: assets/fonts/Inter-latin.woff2, weights: [400, 500, 600] }
  numerals: tabular-nums
motion:
  ease: "cubic-bezier(0.22, 1, 0.36, 1)"
  photo-morph: 0.62s
  tab-underline: 0.36s
safe-area:
  top: 250
  bottom: 400
  sides: 108
  lower-right-keepout: "x > 940 quando y > 960 (botões dos Reels)"
---

## Overview

A identidade é a do site, sem preset: papel com o grão de `.paper-grain` do
começo ao fim, tinta como texto, vermelho ember só em ênfase pontual. Nada de
gradiente, momento escuro, sombra suave ou ícone em quadradinho.

## Color roles

- `paper` é o chão de todas as cenas, com o grão de `.paper-grain`
  (dois `radial-gradient` de 1 px em 3 px e 7 px, que é textura, não
  degradê). `paper-dark` só como fundo de célula vazia do painel (como a
  foto que falta no site).
- `ink` para títulos e texto; `ink-muted` e `ink-soft` para texto secundário.
- `unlit` é a palavra que ainda não acendeu (a frase de "Sobre os dados").
- `ember` só onde o site usa: o "2026" do logotipo, a data do 1º turno, o
  link/aba ativa (o sublinhado que desliza) e a barra de progresso. Nunca
  marca um lado de um confronto; nunca cor de partido.

## Type

- Títulos em Bodoni Moda 400, tracking negativo, como o `h1` da home.
- Texto em Inter; números sempre com `font-variant-numeric: tabular-nums`.
- Sem JetBrains Mono, sem rótulo em mono caixa-alta, sem ponto-médio, sem
  travessão espaçado, sem "→" em link, sem itálico vermelho, sem "§".

## Components

- **Painel da urna**: fotos 3:4 coladas com 2 px de tinta entre elas e borda de
  2 px, número de urna em caixa de tinta no canto inferior esquerdo, nota "O
  número em cada foto é o da urna." na célula que sobra (`PresidentialSheet`).
- **Recorte do site**: captura real, sem retoque. As propostas do comparador
  entram sobre uma faixa `paper-light` de ponta a ponta (o fundo da página do
  comparador), com o divisor entre as colunas; os recortes da ficha e da home
  entram direto no papel, que é o fundo delas no site.
- **Abas**: rótulos em Inter, aba ativa em ember com sublinhado de 3 px que
  desliza na curva do site.
- **Barra de progresso**: fio ember de 6 px no topo da área segura, cresce
  da esquerda como a `.scroll-progress-bar` do Navbar, sobre um fio de tinta
  de 2 px. Acima dele, uma faixa de papel com grão cobre o que rola por baixo,
  como o cabeçalho fixo do site.
