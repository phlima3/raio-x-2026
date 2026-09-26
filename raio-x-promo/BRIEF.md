---
workflow: product-launch-video
flow: automation
storyboard: no
message: "O Raio-X 2026 mostra quem são os candidatos, o que propõem e como votaram, com a fonte ao lado de cada dado, e põe dois lado a lado sem dizer em quem votar."
destination: instagram-reels-stories
aspect: 1080x1920
language: pt-BR
audience: "eleitores no celular, nos dias antes do 1º turno (4 de outubro de 2026)"
length: 30s
angle: "a história da home contada com as telas reais do site (mostrar para vender)"
narration: no
---

## Intent

Vídeo de 30,0 s em pé (9:16) para Reels e Stories divulgando o Raio-X 2026
(https://raio-x-2026.com.br). Conta a mesma história da home, na mesma ordem,
e usa o site de verdade como prova: capturas da produção feitas em 26/09/2026
e os objetos do próprio site se movendo (o painel das fotos de urna, a frase
que acende palavra a palavra, o sublinhado vermelho das abas, a barra vermelha
de progresso), sempre na curva `cubic-bezier(0.22, 1, 0.36, 1)`.

O centro são dois confrontos no comparador, **escolha editorial do dono do
site**: Lula e Flavio Bolsonaro; Renan Santos e Escritor Augusto Cury, nesta
ordem (lado A e lado B como a URL `/comparar?a=…&b=…` define).

Tom: serviço público. O site descreve registros sem pedir voto, aplica o mesmo
critério a todos e sinaliza o que é resumo de IA (`lib/editorial-pages.ts`).
Nada de jingle, placar, vencedor, denúncia ou contagem regressiva.

Pedido original (resumo fiel): "Faça um vídeo de 30 s divulgando o Raio-X
2026, o site deste repositório, contando a mesma história da home e mostrando o
site de verdade, com dois confrontos no comparador: Lula e Flávio Bolsonaro,
Renan Santos e Augusto Cury. Vai para Reels e Stories: vídeo em pé, 9:16."
"Não me pergunte nada: tome as decisões criativas sozinho, registre no
BRIEF.md e vá até o render final."

## Roteiro (cortes nas batidas de 120 BPM)

| Cena | Tempo | O que mostra |
| --- | --- | --- |
| 1. Gancho | 0,0–3,0 s | "Quem são, o que propõem, como votaram." acende uma palavra por colcheia; "1º turno em 4 de outubro." |
| 2. Quem são | 3,0–5,0 s | a página rola até "13 nomes registrados no TSE para a Presidência." e o painel da urna |
| 3. Dupla 1 | 5,0–12,5 s | fotos 13 e 22 saem do painel e viram as colunas; fundo eleitoral; aba Economia; primeira proposta de cada lado com "Resumo por IA" e "Baixar plano no TSE"; fotos voltam |
| 4. Dupla 2 | 12,5–20,0 s | a mesma cena com as fotos 14 e 70 |
| 5. Como votaram | 20,0–22,5 s | a aba Votações de uma ficha fora das duplas, como o site mostra hoje |
| 6. De onde vem | 22,5–26,0 s | "Em todo o país [mapa] direto do TSE, da Câmara e do Senado. Cada dado com a fonte ao lado." e o recorte real do link de fonte |
| 7. Fechamento | 26,0–30,0 s | Raio-X 2026, "Dados públicos, não partidários.", a busca real da home e raio-x-2026.com.br; segura 2,4 s |

## O que foi capturado (26/09/2026, UTC)

Tudo com o Chromium do Playwright do ambiente (`scripts/capture.mjs`), com
Umami, Google Tag Manager/Analytics e o beacon `/api/web-vitals` bloqueados.
Uma captura que voltou sem CSS (502 da produção) foi descartada; o script
agora só aceita página com o estilo do site aplicado.

- **Home** (14:10, 430 px, DSF 3): h1 "Quem são, o que propõem, como
  votaram."; "13 nomes registrados no TSE para a Presidência."; busca "Buscar
  candidato por nome, partido ou estado"; painel com 13 candidaturas em ordem
  de número de urna (13, 14, 16, 21, 22, 27, 28, 29, 30, 35, 55, 70, 80), a 28
  sem foto no próprio site; nota "O número em cada foto é o da urna."; rodapé
  "Dados públicos, não partidários." Nome, número, slug e `src` de cada foto
  saíram do DOM (`capture/data/home.json`) e conferem com
  `/api/candidates?position=PRESIDENTE&limit=100`. As fotos vêm de
  `packages/web/public/images/candidates/tse/` (`assets/photos/fotos.json`).
- **Comparador** (14:33, 640 px, DSF 3, o mínimo com colunas lado a lado):
  `/comparar?a=luiz-inacio-lula-da-silva-pt-sp&b=flavio-bolsonaro-pl-rj` e
  `/comparar?a=renan-santos-missao-sp&b=augusto-jorge-cury-avante-br-presidente-2026`
  (slugs de 13/9 conferidos: todos ainda respondem 200).
- **Ficha** (14:30, 430 px, DSF 3):
  `/candidatos/hertz-da-conceicao-dias-pstu-br-presidente-2026` (regra 4).

### Números que entram no vídeo (iguais em todas as cenas)

| | Fundo eleitoral | Recebido do fundo | Arrecadado | Prestação |
| --- | --- | --- | --- | --- |
| Lula (PT) | 97% da arrecadação | R$ 40.000.000 | de R$ 41.350.926 | 2026, atualizada em 17/09/2026 |
| Flavio Bolsonaro (PL) | 84% | R$ 47.000.000 | de R$ 56.177.511 | 2026, atualizada em 17/09/2026 |
| Renan Santos (MISSÃO) | 0% | R$ 0 | de R$ 2.246.941 | 2026, atualizada em 16/09/2026 |
| Escritor Augusto Cury (AVANTE) | 5,3% | R$ 150.000 | de R$ 2.821.248 | 2026, atualizada em 16/09/2026 |

Renan Santos entregou a prestação e declarou R$ 0 de fundo eleitoral: é zero
declarado, não ausência. Outros números: 13 nomes registrados para a
Presidência; situação eleitoral "Registro deferido", "verificada em 18 de
setembro de 2026 às 10:25".

Nomes de urna como o título da ficha mostra (`nomeConhecido`), conferidos no
HTML das fichas: "Lula", "Flavio Bolsonaro" (sem acento, como está no TSE),
"Renan Santos", "Escritor Augusto Cury". Partido como `partyLabel`:
presidenciável só com o partido (PT, PL, MISSÃO, AVANTE).

## Regras neutras (fixadas antes de olhar os dados) e o que deram

1. **Tema dos confrontos.** O primeiro da ordem do site (Economia, Saúde,
   Educação, Segurança, Meio Ambiente) em que os quatro tenham ao menos uma
   proposta, contado pelos dados do comparador (`proposalsA`/`proposalsB`),
   sem ler o conteúdo. **Resultado: Economia** (Lula 5, Flavio Bolsonaro 6,
   Renan Santos 6, Escritor Augusto Cury 11). As abas do site estão em ordem
   alfabética (Economia, Educação, Meio Ambiente, Outros, Política Externa,
   Saúde, Segurança, Tecnologia); nas duas ordens o primeiro é Economia.
2. **Proposta mostrada em cada coluna.** A primeira da coluna, na ordem em que
   o comparador lista, para os quatro:
   - Lula: "Aprimorar os mecanismos de utilização do poder de compra do Estado
     em todos os níveis da federação, estimulando a descentralização das
     contr" (o próprio site corta o título assim);
   - Flavio Bolsonaro: "Simplificar a conta de luz por meio da racionalização
     de encargos e da redução gradual da Conta de Desenvolvimento Energético
     (CDE)";
   - Renan Santos: "Aprovação da PEC do Equilíbrio Fiscal para desindexar
     benefícios previdenciários do salário mínimo, desvincular pisos de saúde
     e educação e" (cortado pelo site);
   - Escritor Augusto Cury: "Projeto BEE (Brasil Empreendedor nas Estradas)
     para implantar polos organizados de comércio popular ao longo das
     rodovias".
   As quatro são "Plano de governo registrado no TSE", "Resumo por IA", com
   link "Baixar plano no TSE" para o pacote oficial do TSE.
3. **Fundo eleitoral.** Só entra se o comparador trouxer o bloco para as duas
   duplas. **Trouxe para as duas**, então entra nas duas.
4. **Ficha da tabela de votações (cena 5).** O primeiro presidenciável fora das
   duplas, em ordem de número de urna, com votações; se nenhum, o primeiro
   candidato ao Senado com votações em ordem alfabética do nome de urna.
   *Extensão escrita antes de consultar os governadores:* se nenhum ao Senado,
   o primeiro candidato a governador com votações, na mesma ordem.
   **Resultado: nenhuma ficha tem votações.** A varredura lenta
   (`scripts/regra4.mjs`, `capture/data/regra4.json`, 26/09 14:27 UTC, só
   respostas `success: true`) conferiu 9 presidenciáveis, 282 candidatos ao
   Senado e 173 a governador: zero votações em todas. As quatro fichas das
   duplas também têm zero. A tabela Sim/Não/Abstenção não existe hoje em
   nenhuma ficha do site, e inventá-la, usar seed ou uma captura antiga está
   vetado. **Decisão:** a cena 5 mostra a aba Votações como o site mostra hoje,
   da primeira ficha na ordem neutra da regra (presidenciável de menor número
   de urna fora das duplas: 16), sem nome, foto ou partido: "Histórico de
   votações não disponível para este candidato." e "Sincronização diária com a
   Câmara dos Deputados e o Senado Federal." A ausência aparece como ausência,
   como pede a política editorial. Quando o sync do Congresso preencher as
   fichas, basta recapturar e trocar o recorte.
5. **Link de fonte da situação eleitoral (cena 6).** Da mesma ficha da regra 4
   (16), cortado sem o rótulo e sem nada que identifique a pessoa: selo
   "Registro deferido", "A Justiça Eleitoral deferiu o registro da
   candidatura." e "Ver fonte · verificada em 18 de setembro de 2026 às
   10:25".
6. **Quem aparece fora dos confrontos.** O painel mostra todos os 13, do mesmo
   jeito, em ordem de número de urna; as cenas 5 e 6 usam recortes que não
   dizem de quem é o dado. O chip de rostos de "Sobre os dados" (só quatro
   presidenciáveis) ficou de fora da cena 6.

## Decisões de direção

- **Mesmo tratamento para A e B.** As duas duplas saem da mesma função em
  `scripts/build.mjs`: mesma duração (7,5 s), mesma marcação de tempo, mesma
  música compasso a compasso, mesmos SFX; colunas de 410 px, fotos no mesmo
  tamanho, tudo de A e B acende no mesmo instante. Os recortes das propostas
  estão na mesma escala (1,464 px por px CSS).
- **O fundo eleitoral é desenhado, não recortado.** No comparador real o
  percentual fica em ember quando há dinheiro público; na dupla 2 isso deixaria
  o vermelho só no lado B (Renan Santos declarou 0%). O vídeo escreve as
  cifras exatas do site, as duas em tinta, com o mesmo corpo.
- **Recortes reais onde a prova é o site**: as primeiras propostas de Economia
  (as duas colunas lado a lado, sobre uma faixa papel-claro como a página do
  comparador), o painel vazio da aba Votações, o link de fonte e a busca da
  home. Os recortes evitam o que a revisão tirou do site quando dá (sem "§",
  sem o rótulo mono "DADOS" nem o "SITUAÇÃO ELEITORAL", sem o cabeçalho do
  comparador com partido e UF em mono); o link de fonte e a linha "Resumo por
  IA · Baixar plano no TSE" são mono caixa-alta no site e entram porque foram
  pedidos. As barras de abas (comparador e Transparência) são desenhadas em
  Inter, com os mesmos rótulos do site.
- **O que o vídeo desenha** (títulos, abas, cifras, legendas) é Bodoni Moda e
  Inter, sem mono, ponto-médio, "→", "§" ou itálico vermelho. O tamanho óptico
  da Bodoni segue o corpo aparente no celular (~0,36 do corpo no quadro); o
  logotipo usa o do wordmark do Navbar.
- **Movimento só do site.** Texto novo acende (do `#c9c1ad` para a cor final);
  troca de página cruza em 480 ms e a foto passa em 620 ms; a página rola com
  a barra vermelha crescendo; o sublinhado das abas desliza em 360 ms (nas
  duplas até "Economia" e na cena 5 até "Votações"). Sem animação de entrada
  genérica, sem contador animado.
- **Faixa de papel sob a barra do topo** (y < 250): o que rola passa por baixo,
  como no cabeçalho fixo do site, e a área do Instagram fica limpa.
- **Contornos de tinta** marcam "Resumo por IA" e "Baixar plano no TSE" nas
  duas colunas ao mesmo tempo, com a legenda "Resumo por IA, com o link para o
  plano de governo no TSE."
- **Sem preset do HyperFrames**: a identidade é a do site (`frame.md`).
- **Composição monolítica** (`index.html` gerado por `scripts/build.mjs`): as
  fotos atravessam várias cenas e tudo roda numa linha de tempo só. O lint
  avisa que o Studio prefere subcomposições; aviso aceito.

## Customizations

- Sem locução (não há chave de voz). A história é contada por texto na tela,
  curto e legível no celular, e funciona no mudo.
- Trilha sintetizada em `scripts/make_music.py` (numpy): 120 BPM (uma batida =
  15 quadros a 30 fps; 30,0 s = 15 compassos), Fá maior, pad morno, pulso de
  colcheias abafado, baixo e bumbo em meio-tempo; acordes trocam nos cortes e o
  fecho resolve em Fá no início do compasso 14 (26,0 s). O vídeo final mede
  −14,0 LUFS integrados e −1,0 dBTP de pico.
- SFX da biblioteca local do media-use (Pixabay, sem atribuição obrigatória),
  registrados em `.media/manifest.jsonl`: `whoosh-short` (volume 0,3) quando
  as fotos saem e voltam ao painel (5,0; 11,5; 12,5; 19,0 s) e `click-soft`
  (0,6) quando o sublinhado chega à aba (8,4; 15,9; 20,5 s).

## Entrega

`raio-x-promo.mp4`: 30,000 s, 1080×1920, 30 fps (900 quadros), H.264 High
`yuv420p`, AAC LC 48 kHz estéreo, 10,9 MiB (preset `delivery`, CRF 15).
Dois renders completos: um de revisão (contact sheet, uma rodada de
correções: a data do gancho acende mais cedo, o fecho passa de 25,5 s para
26,0 s e a frase da cena 6 fica acesa por mais tempo, cliques mais audíveis) e
o final. `npx hyperframes check` passa: 0 erros; avisos só do lint estrutural
(composição monolítica) e de contraste nas palavras ainda apagadas, que é o
próprio efeito da frase que acende.

## Notes

- Faixa segura conferida nos snapshots e na contact sheet (desenhada só nas
  imagens de revisão): nada importante acima de y = 250, abaixo de y = 1520,
  nem com x > 940 abaixo de y = 960.
- Contagem regressiva do site ("1º turno em 8 dias") não aparece; o vídeo diz
  a data.
- Nenhum logo ou brasão do TSE, da Câmara ou do Senado; citados pelo nome.
