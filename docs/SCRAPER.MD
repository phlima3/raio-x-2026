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
| `syncPresidenciaveis` | Manual / semanal | Descobre presidenciáveis via notícias (JOTA, G1, Datafolha, Wikipédia) e extrai propostas atribuídas |

---

## Como rodar manualmente

```bash
cd packages/scraper

# Job individual
pnpm run sync:camara
pnpm run sync:senado
pnpm run process:proposals

# Presidenciáveis via notícias (candidatos + propostas)
pnpm run sync:presidenciaveis              # tudo
pnpm run sync:presidenciaveis candidates   # só lista de candidatos
pnpm run sync:presidenciaveis proposals    # só propostas

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
LLM_PROVIDER=groq   # ou gemini | ollama
GROQ_API_KEY=...
GEMINI_API_KEY=...

# Para rodar com modelo local via Ollama (https://ollama.com):
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434   # default
# OLLAMA_MODEL=llama3.1:8b                 # default
```

O `proposalExtractor.ts` instancia o provider correto automaticamente.
Os três providers compartilham os mesmos prompts (`llm/baseProvider.ts`) —
cada provider concreto só implementa `complete(prompt)`.

Modelos Ollama recomendados para extração em PT-BR:

| Modelo         | RAM     | Observação                                |
| -------------- | ------- | ----------------------------------------- |
| `llama3.1:8b`  | ~8 GB   | Bom equilíbrio qualidade/velocidade       |
| `qwen2.5:14b`  | ~16 GB  | Melhor aderência a JSON estruturado       |
| `llama3.3:70b` | GPU 48G | Qualidade próxima do Groq (lento em CPU)  |

---

## Sync de presidenciáveis via notícias

O job `syncPresidenciaveis` (`src/jobs/syncPresidenciaveis.ts`) mantém a lista de
candidatos à Presidência atualizada a partir da imprensa, em 3 passos:

1. **Fetch** — baixa as fontes curadas de `src/data/presidentialSources.ts`
   (JOTA, Wikipédia, Datafolha, G1). Fontes com `requiresBrowser: true` usam
   Playwright com user agent de navegador real; as demais tentam HTTP simples primeiro.
2. **Extração de candidatos** — LLM extrai `{name, party, status, homeState, poll}`
   de cada artigo. Os resultados são mesclados entre fontes (status mais forte vence:
   `desistiu > confirmado > pre_candidato > cotado`) e casados com o banco por
   normalização de nomes + aliases (`CANDIDATE_ALIASES` — "Lula" → nome completo).
   - Candidatos existentes: atualiza `candidacyStatus` e partido (se mudou)
   - Candidatos novos (`confirmado`/`pre_candidato` com partido): cria com slug
   - Quem desistiu **não é deletado** — apenas marcado com `candidacyStatus=desistiu`
3. **Extração de propostas** — LLM extrai propostas explicitamente atribuídas a cada
   candidato nos artigos (`source: "news"`, deduplicadas por hash SHA-1 do texto).

Para atualizar as fontes (ex: nova pesquisa Datafolha, novo artigo mensal do JOTA),
edite `src/data/presidentialSources.ts`.

No GitHub Actions: Actions → Scraper (Scheduled Sync) → Run workflow → `presidenciaveis`.

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
