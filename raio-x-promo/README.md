# raio-x-promo

Vídeo de 30 s em pé (1080×1920, 30 fps) para Reels e Stories, feito com
[HyperFrames](https://hyperframes.heygen.com) a partir do site em produção.
Decisões, dados capturados e regras neutras: [BRIEF.md](BRIEF.md). Plano cena a
cena: [STORYBOARD.md](STORYBOARD.md). Identidade: [frame.md](frame.md).

Resultado: [`raio-x-promo.mp4`](raio-x-promo.mp4).

## Refazer

```bash
cd raio-x-promo
npm install                                   # gsap e playwright-core
export HYPERFRAMES_NO_TELEMETRY=1

# 1. Capturar o site (Chromium do Playwright; Umami, GTM e Web Vitals bloqueados)
node scripts/capture.mjs home
node scripts/capture.mjs comparar luiz-inacio-lula-da-silva-pt-sp flavio-bolsonaro-pl-rj "" 640
node scripts/capture.mjs comparar renan-santos-missao-sp augusto-jorge-cury-avante-br-presidente-2026 "" 640
node scripts/capture.mjs ficha hertz-da-conceicao-dias-pstu-br-presidente-2026 430
NODE_USE_ENV_PROXY=1 node scripts/regra4.mjs  # regra 4 do BRIEF, devagar (a API limita 100/min)

# 2. Trilha (numpy) e composição
python3 scripts/make_music.py                 # assets/audio/trilha.wav
node scripts/build.mjs                        # index.html, gerado a partir de capture/data

# 3. Conferir e renderizar
npx hyperframes check
npx hyperframes snapshot --at 4.6,7.4,10.9,21.3,24.6,29.5
python3 scripts/contact_sheet.py pngs snapshots snapshots/folha-snapshots.jpg
npx hyperframes render --quality delivery --output raio-x-promo.mp4
python3 scripts/contact_sheet.py video raio-x-promo.mp4 snapshots/contact-sheet.jpg
```

Os recortes finais saem de `capture/raw/` para `assets/captures/` (o passo está
no histórico do BRIEF). `index.html` é gerado: edite `scripts/build.mjs`.
A faixa segura dos Reels só é desenhada nas folhas de revisão, nunca no vídeo.
