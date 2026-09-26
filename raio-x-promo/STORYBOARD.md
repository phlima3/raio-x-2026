---
format: 1080x1920
duration: 30s
fps: 30
bpm: 120
message: "O Raio-X 2026 mostra quem são os candidatos, o que propõem e como votaram, com a fonte ao lado de cada dado, e põe dois lado a lado sem dizer em quem votar."
arc: Gancho → Quem são → Dupla 1 → Dupla 2 → Como votaram → De onde vem → Fechamento
audience: eleitores no celular, antes do 1º turno
mode: autonomous
music: trilha sintetizada (scripts/make_music.py), 120 BPM, Fá maior
---

## Video direction

- **Uma página rolando.** O vídeo é o site se mexendo: o que muda de lugar
  muda como no site. Rolagem (a página sobe e a barra vermelha do topo cresce),
  troca de página (a foto passa de um lugar para o outro em 620 ms, o resto
  some e aparece em 480 ms, como as View Transitions de `globals.css`), a frase
  que acende palavra a palavra (do `#c9c1ad` para a tinta), o sublinhado que
  desliza entre as abas (360 ms). Tudo na curva `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Sem animação de entrada genérica.** Nada sobe com fade, nada quica, nada
  respira. Texto novo acende; recorte novo chega com a página.
- **Paleta**: papel `#f1ebdc` com grão do começo ao fim; tinta; `#554c45` e
  `#8a8079` no secundário; ember `#b8321f` só no "2026" do logotipo, na data do
  1º turno, na aba ativa, no link e na barra de progresso.
- **Ritmo**: cortes nas batidas de 120 BPM (0, 3, 5, 12,5, 20, 22,5 e 26 s).
  As duas duplas têm a mesma duração, a mesma música e a mesma coreografia,
  lado A e lado B sempre ao mesmo tempo.
- **Faixa segura**: tudo o que importa entre y = 250 e y = 1520, margem lateral
  de 108 px, e nada importante com x > 940 abaixo de y = 960.
- **Nunca**: gradiente, momento escuro, mono caixa-alta desenhado pelo vídeo,
  ponto-médio, travessão espaçado, "→", "§", itálico vermelho, contador
  animado, placar, vencedor, contagem regressiva, logo ou brasão de órgão
  público, cor de partido.

## Frame 1 — Gancho

- scene: "Quem são, o que propõem, como votaram." acende palavra a palavra; embaixo, "1º turno em 4 de outubro."
- duration: 3s
- transition_in: cut
- status: animated
- src: index.html#s-home

0,0–1,75 s: o h1 da home em Bodoni, com a mesma quebra do celular (três
linhas), nasce cinza e acende uma palavra por colcheia, junto com o pulso da
trilha. 1,75–2,25 s: "1º turno em" acende em tinta secundária e "4 de
outubro." em ember (a data, nunca "faltam N dias").

## Frame 2 — Quem são

- scene: a página rola até o painel da urna, 13 fotos oficiais do TSE em ordem de número de urna
- duration: 2s
- transition_in: rolagem (barra de progresso 0 → 12%)
- status: animated
- src: index.html#s-home

3,0–3,6 s: a página sobe 1.700 px e traz "13 nomes registrados no TSE para a
Presidência." e o painel (4 colunas, como no celular), com a célula vazia do
28, que não tem foto no site, e a nota "O número em cada foto é o da urna.".
3,25–4,4 s: a frase acende. Painel parado.

## Frame 3 — Lula e Flavio Bolsonaro, lado a lado

- scene: as fotos 13 e 22 saem do painel e viram as colunas do comparador; fundo eleitoral; aba Economia; a primeira proposta de cada coluna com o selo e o link do TSE
- duration: 7.5s
- transition_in: troca de página (fotos passam, resto cruza em 480 ms)
- status: animated
- src: index.html#s-dupla1

τ 0,0–0,62: as duas fotos voam do painel para o alto das colunas (A à
esquerda, B à direita). τ 0,5–2,4: acendem "Lado a lado", nomes de urna,
partidos, "Fundo eleitoral, dinheiro público" e as cifras (97% / 84%,
R$ 40.000.000 / R$ 47.000.000, de quanto foi arrecadado, data da prestação).
τ 3,0–3,6: a página rola; as fotos encolhem para o cabeçalho fixo; entram as
abas do comparador desenhadas em Inter e o sublinhado vermelho desliza até
"Economia" (τ 3,4). τ 3,6–5,0: os recortes reais das primeiras propostas de
Economia, lado a lado, na mesma escala. τ 5,0–6,3: contornos de tinta no
"Resumo por IA" e no "Baixar plano no TSE" das duas colunas e a legenda
acende. τ 6,5–7,12: as fotos voltam para o painel.

## Frame 4 — Renan Santos e Escritor Augusto Cury, lado a lado

- scene: a mesma cena da dupla 1, com as fotos 14 e 70
- duration: 7.5s
- transition_in: troca de página
- status: animated
- src: index.html#s-dupla2

Mesmo template, mesma marcação de tempo, mesma trilha, mesmos SFX. Cifras:
0% / 5,3%, R$ 0 / R$ 150.000, de R$ 2.246.941 / de R$ 2.821.248 arrecadados.

## Frame 5 — Como votaram

- scene: "Como votaram" e a aba Votações de uma ficha fora das duplas, como o site mostra hoje
- duration: 2.5s
- transition_in: troca de página (barra 52 → 66%)
- status: animated
- src: index.html#s-votos

Nenhuma das 468 fichas tinha votações em 26/09/2026 (ver BRIEF.md). As abas
da Transparência (Dados, Votações, Patrimônio, Financiamento) são desenhadas em
Inter e o sublinhado vermelho desliza até "Votações" (20,5 s, mesmo clique das
duplas). Embaixo, o recorte real do painel da ficha 16 (regra 4, ordem de
número de urna), sem nome nem foto: "Histórico de votações não disponível para
este candidato." e "Sincronização diária com a Câmara dos Deputados e o Senado
Federal.".

## Frame 6 — De onde vem

- scene: "Em todo o país [mapa] direto do TSE, da Câmara e do Senado. Cada dado com a fonte ao lado." acende; embaixo, o recorte real do link de fonte da situação eleitoral
- duration: 3.5s
- transition_in: troca de página (barra 66 → 80%)
- status: animated
- src: index.html#s-fontes

A frase de "Sobre os dados", a partir de "em todo o país" (sem o chip de
rostos, que mostraria só quatro presidenciáveis), com o mapa de
`lib/brazilMap.ts` acendendo como palavra. Quando "fonte" acende, um
sublinhado ember desliza sob "Ver fonte · verificada em 18 de setembro de 2026
às 10:25" no recorte.

## Frame 7 — Fechamento

- scene: logotipo Raio-X 2026, "Dados públicos, não partidários.", a busca real da home e raio-x-2026.com.br; segura ~2,4 s
- duration: 4s
- transition_in: troca de página (barra 80 → 100%)
- status: animated
- src: index.html#s-fecho

26,25 s "Raio-X" acende; 26,5 s "2026" acende em ember; 26,75–27,2 s a frase
do rodapé; a busca ("Buscar candidato por nome, partido ou estado") é o
recorte real; 27,5 s acende o endereço. Segura até 30,0 s enquanto a trilha
resolve em Fá (o acorde entra no tempo forte das 26,0 s) e some.
