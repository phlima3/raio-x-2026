# Scraper — Raio-X 2026

Documentação do pacote `packages/scraper`.

---

## Estrutura

```
packages/scraper/
├── src/
│   ├── sources/
│   │   ├── camara.ts         # API da Câmara dos Deputados
│   │   ├── senado.ts         # API do Senado Federal
│   │   ├── tse.ts            # TSE (CSV + REST)
│   │   └── candidateSites.ts # Playwright scraping
│   ├── processors/
│   │   ├── geminiProcessor.ts   # Integração Gemini
│   │   ├── groqProcessor.ts     # Integração Groq (fallback)
│   │   └── proposalExtractor.ts # Orquestra o LLM correto
│   ├── jobs/
│   │   ├── dailySync.ts      # Cron diário (APIs gov)
│   │   └── weeklyProposals.ts # Cron semanal (propostas)
│   ├── utils/
│   │   ├── playwright.ts     # Setup browser + helpers
│   │   ├── httpClient.ts     # Axios com retry + rate limit
│   │   └── logger.ts         # Winston logger
│   └── index.ts
```

---

## Jobs e frequências

| Job               | Frequência      | O que faz                                               |
| ----------------- | --------------- | ------------------------------------------------------- |
| `dailySync`       | Todo dia às 3h  | Votações + PLs da Câmara e Senado                       |
| `weeklyProposals` | Domingo às 2h   | Scraping de sites + processamento LLM                   |
| `tseImport`       | Manual / mensal | Importa CSVs do TSE (candidaturas, bens, financiamento) |

---

## Como rodar manualmente

```bash
cd packages/scraper

# Job individual
pnpm run sync:camara
pnpm run sync:senado
pnpm run process:proposals

# Todos os jobs
pnpm run sync:all

# Modo watch (desenvolvimento)
pnpm run dev
```

---

## Estratégias anti-bloqueio (Playwright)

1. **User-agent rotation** — lista de UAs reais rotacionada por request
2. **Delays aleatórios** — entre 1.5s e 4s entre requests do mesmo domínio
3. **Fallback para PDF** — se o site bloquear, tenta baixar o PDF do programa de governo
4. **Retry com backoff exponencial** — 3 tentativas com 5s, 15s, 45s de espera

---

## LLM Provider

Configurado via `LLM_PROVIDER` no `.env`:

```env
LLM_PROVIDER=groq   # ou gemini
GROQ_API_KEY=...
GEMINI_API_KEY=...
```

O `proposalExtractor.ts` instancia o provider correto automaticamente.

---

## Adicionando um novo candidato

1. Adicione o candidato no seed em `packages/api/prisma/seed.ts`
2. Adicione a URL do site em `packages/scraper/src/sources/candidateSites.ts`
3. Rode `pnpm run process:proposals -- --candidate=slug-do-candidato`

---

## Logs

Logs ficam em `packages/scraper/logs/`:

- `combined.log` — todos os logs
- `error.log` — apenas erros

Em desenvolvimento, os logs também saem no terminal com cores.
