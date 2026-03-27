# 🗺️ Roadmap — Raio-X 2026

Plataforma de transparência eleitoral brasileira para as Eleições Gerais de outubro de 2026.

---

## Status atual (março/2026)

| Serviço            | Status                                                   |
| ------------------ | -------------------------------------------------------- |
| Web (Next.js)      | ✅ Produção: raio-x-2026.com.br (Vercel)                 |
| API (Express)      | ✅ Produção: api-production-bf20.up.railway.app (Railway) |
| PostgreSQL         | ✅ Railway (internal: postgres.railway.internal:5432)     |
| Redis              | ✅ Railway (configurado via REDIS_URL)                    |
| Migrations         | ✅ Init + camaraId/senadoId + unaccent                   |
| Dados reais        | ✅ 12 candidatos com bios + fotos + 5 propostas Gemini   |
| Enriquecimento LLM | ✅ Gemini Deep Search (manual) → importGeminiData.ts     |

---

## Fase 1 — Dados Governamentais (Semanas 1–2)

> Prioridade máxima. APIs públicas, sem IA, dados confiáveis.

### 1.1 — Integração API Câmara dos Deputados ✅

- [x] Listar deputados federais com filtros (nome, partido, UF) — `getDeputados(filters)`
- [x] Buscar votações por parlamentar — `getVotacoesByDeputado(id, filters)`
  > ⚠️ O endpoint `/deputados/{id}/votacoes` foi removido na v2. Implementado via varredura de `/votacoes/{id}/votos`.
- [x] Buscar projetos de lei de autoria — `getProposicoesByDeputado(id)`
- [x] Buscar detalhes do deputado — `getDeputadoById(id)`
- [x] Salvar tudo no PostgreSQL via Prisma (upsert por `camaraId`, dedup de votações)
- [ ] Buscar presença e faltas em sessões *(baixa prioridade — API não expõe diretamente)*

**Endpoint base:** `https://dadosabertos.camara.leg.br/api/v2`

### 1.2 — Integração API Senado Federal ✅

- [x] Listar senadores — `getSenadores()`
- [x] Buscar detalhes do senador — `getSenadoreById(codigo)`
- [x] Buscar votações — `getVotacoesBySenador(codigo, filters)`
- [x] Buscar matérias de autoria — `getMateriasBySenador(codigo)`
- [x] Salvar no PostgreSQL via Prisma (upsert por `senadoId`, dedup de votações)

**Endpoint base:** `https://legis.senado.leg.br/dadosabertos`

### 1.3 — Integração TSE

- [ ] Baixar CSV de candidatos registrados (disponível após agosto/2026)
- [ ] Importar declaração de bens
- [ ] Importar dados de financiamento de campanha
- [ ] Parser e inserção no banco

**Fonte:** `https://dadosabertos.tse.jus.br`

### 1.4 — Seed manual de candidatos (MVP) ✅

- [x] Criar seed com os candidatos presidenciais confirmados (8 candidatos)
- [x] Criar seed com candidatos a governador dos 7 estados prioritários (SP, MG, RJ, RS, BA, PR, GO)
- [x] `pnpm db:seed` em `packages/api` — `prisma/seed.ts`
- [x] Seed prioriza valores existentes no banco (Gemini imports) sobre defaults hardcoded

### 1.5 — Enriquecimento com Gemini Deep Search ✅

- [x] Prompts otimizados por candidato em `packages/scraper/src/data/gemini-research/_prompts/`
- [x] Outputs JSON por candidato em `packages/scraper/src/data/gemini-research/outputs/` (12 arquivos)
- [x] `importGeminiData.ts` — lê JSONs, valida com Zod, upserta bio/foto/siteUrl/bioSummary + 5 proposals/tema
- [x] Preflight idempotente: Renan Santos MBL → Missão (party + slug corrigidos)
- [x] GitHub Actions job `import-gemini` em `scraper.yml` com `PROD_DATABASE_URL`
- [x] Busca accent-insensitive via PostgreSQL `unaccent` extension (migration aplicada)
- [x] Todos os 12 candidatos com bios ricas, fotos e propostas por tema em produção

---

## Fase 2 — API Interna REST (Semanas 2–3)

> Backend pronto para o frontend consumir.

### 2.1 — Endpoints de candidatos ✅

- [x] `GET /api/candidates` — lista com filtros (cargo, estado, partido, busca, paginação)
- [x] `GET /api/candidates/stats` — totais por cargo/partido/estado
- [x] `GET /api/candidates/:slug` — perfil completo com proposals, votes, assets, financing
- [x] `GET /api/candidates/:slug/proposals` — propostas agrupadas por categoria
- [x] `GET /api/candidates/:slug/transparency` — votações, bens, financiamento

### 2.2 — Endpoints de comparação ✅

- [x] `GET /api/comparison?candidateA=slug1&candidateB=slug2` — comparação com IA por tema
- [x] `GET /api/comparison/topics` — temas disponíveis com contagem

### 2.3 — Endpoints de propostas ✅

- [x] `GET /api/proposals` — lista com filtros (candidateId, category, status, source, busca)
- [x] `GET /api/proposals/categories` — categorias distintas com contagem
- [x] `GET /api/proposals/:id` — detalhe de uma proposta

### 2.4 — Cache com Redis ✅

- [x] `cacheService.ts` com `withCache()`, `invalidate()`, `cacheKey` builders
- [x] TTL 1h: lista de candidatos, perfil, propostas por candidato
- [x] TTL 1h: resultado de comparação (LLM caro)
- [x] TTL 6h: categorias de propostas
- [x] Fallback gracioso — Redis indisponível não quebra a API

---

## Fase 3 — Scraping de Propostas (Semanas 3–4)

> Coleta de propostas dos sites dos candidatos e PDFs de programas de governo.

### 3.1 — Playwright scraper base

- [x] Setup do browser headless com Playwright (`withPage`, browser pool, `createContext`)
- [x] Helper de rate limiting e retry (exponential backoff no HTTP client)
- [ ] User-agent rotation
- [x] Extração de texto limpo de HTML (base implementada em `candidateSites.ts`)

### 3.2 — Scraper por candidato ✅

- [x] `scrapeCandidateSite(config)` — Playwright, detecta página de propostas automaticamente
- [x] `detectProposalsPage(siteUrl)` — varre links procurando `/propostas`, `/programa`, etc.
- [x] `syncCandidateSites(configs)` — batch com concorrência, delay polido entre sites
- [x] `loadCandidateSiteConfigs()` — carrega candidatos com `siteUrl` do banco
- [x] URLs dos candidatos prioritários incluídas no seed (1.4)
- [ ] Download e extração de PDFs de programas de governo *(pós-convenções, agosto/2026)*

### 3.3 — Integração com LLM (Gemini ou Groq) ✅

- [x] Provider abstrato (`LLMProvider` interface + Zod schemas em `processors/llm/types.ts`)
- [x] `GroqProvider` — Groq (`llama-3.3-70b-versatile`), provider padrão para dev/MVP
- [x] `GeminiProvider` — Gemini 1.5 Pro, mesmo contrato, troca via `LLM_PROVIDER=gemini`
- [x] `createProvider()` factory — seleciona provider via env var, singleton
- [x] Prompt de extração de propostas → JSON por tema — `extractProposals`
- [x] Prompt de sumarização de PL em linguagem simples — `summarizeProposal`
- [x] Prompt de bio — `summarizeBio`
- [x] Prompt de comparação neutra — `compareProposals`
- [x] Validação do JSON retornado (Zod) com fallback para objeto vazio
- [x] Pipeline completo em `proposalExtractor.ts` — HTML→texto→LLM→upsert DB

### 3.4 — Cron jobs ✅ (parcial)

- [x] Estrutura de cron jobs implementada (`dailySync.ts`, `weeklyProposals.ts`)
- [x] Job semanal: carrega configs do banco → `syncCandidateSites()` → pipeline LLM
- [x] Job diário: `syncCamara()` + `syncSenado()` em paralelo com `Promise.allSettled`
- [ ] Job mensal: reimporta dados do TSE *(disponível pós-agosto/2026)*

---

## Fase 4 — Frontend (Semanas 4–6) ✅

> Interface pública para o eleitor.

### 4.1 — Página inicial ✅

- [x] Busca de candidatos por nome (form → `/busca?q=`)
- [x] Filtros por cargo (presidente, governador) e estado (quick links na hero)
- [x] Cards de candidatos com foto, partido e cargo atual (`CandidateCard`)
- [x] Stats bar (total, partidos, estados, presidenciáveis)

### 4.2 — Página de perfil do candidato ✅

- [x] Bloco: quem é (bio, partido, trajetória, incumbente badge)
- [x] Bloco: propostas por tema (accordion via `<details>/<summary>`, `ProposalBlock`)
- [x] Bloco: histórico de votações (tabela com código de cores, `TransparencyPanel`)
- [x] Bloco: declaração de bens (timeline com variação YoY)
- [x] Bloco: financiamento de campanha (cards arrecadado/gasto)
- [x] ISR `generateStaticParams` para presidentes + governadores

### 4.3 — Comparador ✅

- [x] Seleção de dois candidatos (picker server-side com URL params)
- [x] Comparação lado a lado por tema de proposta
- [x] Resumo de IA por tema (banner destacado)
- [x] Tabs de tema com atualização de URL (sem reload)

### 4.4 — SEO e performance ✅

- [x] SSG (Static Site Generation) para páginas de candidatos (`generateStaticParams`)
- [x] ISR (Incremental Static Regeneration) — `revalidate = 3600` na home
- [x] Metadados OpenGraph para compartilhamento (`generateMetadata`)

### 4.5 — Busca ✅

- [x] `/busca` — página de resultados com filtros por cargo e estado

---

## Fase 5 — Qualidade e Lançamento (Semanas 6–8)

### 5.1 — Score de consistência (feature diferencial) ✅

- [x] Cruzar propostas declaradas com histórico de votações (`consistencyService.ts`)
- [x] Calcular score 0–100 por tema via LLM (`geminiService.analyzeConsistency`)
- [x] Armazenar no banco (`ConsistencyScore` model, migration aplicada)
- [x] Endpoint `GET /api/candidates/:slug/consistency` — computa on-demand, cacheia
- [x] Exibir contradições detectadas no perfil do candidato (`ConsistencyPanel.tsx`)

### 5.2 — Monitoramento de notícias

- [ ] Gemini Search Grounding para rastrear declarações recentes
- [ ] Atualizar "declarações recentes" no perfil
- [ ] Alertas de contradição com posições anteriores

### 5.3 — Deploy em produção ✅

- [x] CI/CD com GitHub Actions:
  - `ci.yml` — type check + build em PRs e push para develop
  - `deploy-web.yml` — deploy Next.js para Vercel em push para main
  - `deploy-api.yml` — deploy API para Railway + migrate em push para main
  - `scraper.yml` — sync diário (Câmara/Senado), semanal (sites + LLM), `import-gemini`, `populate`, `fix-migration`
- [x] Domínio `raio-x-2026.com.br` apontando para Vercel (Hostinger DNS)
- [x] Secrets configurados: `PROD_DATABASE_URL`, `PROD_REDIS_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`
- [ ] Monitoramento de uptime (UptimeRobot / Vercel Analytics)

### 5.4 — Lançamento público

- [ ] Cobertura dos candidatos presidenciais confirmados (pós-convenções, agosto)
- [ ] 7 estados prioritários com governadores
- [ ] Divulgação

---

## Calendário eleitoral de referência

| Data                | Evento                                       |
| ------------------- | -------------------------------------------- |
| 20 jul – 5 ago 2026 | Convenções partidárias                       |
| 15 ago 2026         | Prazo final de registro de candidatos no TSE |
| **4 out 2026**      | **1º turno**                                 |
| 25 out 2026         | 2º turno (se necessário)                     |

---

## Próxima ação imediata

**→ Qualidade de conteúdo e features pré-convenções (Fase 5.2 + 6)**

O site está no ar com dados reais. Candidatos têm bios ricas, fotos e propostas por tema. Próximas prioridades:

1. **Fotos faltando** — Tarcísio de Freitas não tem foto (Wikipedia URL retorna erro no Next.js Image). Investigar `next/image` unoptimized ou domínio permitido.
2. **Fase 5.2** — Monitoramento de notícias via Gemini Search Grounding (busca automática de declarações recentes).
3. **UX** — Melhorar página de candidato: mostrar `bioSummary` (contexto eleitoral recente), aprovação, carreira política.
4. **Monitoramento** — Uptime robot + alertas de falha nos cron jobs.
5. **Pré-convenções (julho/2026)** — Atualizar candidatos confirmados, PDFs de programas de governo.
6. **TSE (agosto/2026)** — Importar declaração de bens e financiamento de campanha quando disponíveis.
