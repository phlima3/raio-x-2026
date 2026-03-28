# 🗺️ Roadmap — Raio-X 2026

Plataforma de transparência eleitoral brasileira para as Eleições Gerais de outubro de 2026.

---

## Status atual (março/2026)

| Serviço            | Status                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| Web (Next.js)      | ✅ Produção: raio-x-2026.com.br (Vercel)                                            |
| API (Express)      | ✅ Produção: api-production-bf20.up.railway.app (Railway)                           |
| PostgreSQL         | ✅ Railway (internal: postgres.railway.internal:5432)                               |
| Redis              | ✅ Railway (configurado via REDIS_URL)                                              |
| Migrations         | ✅ Init + camaraId/senadoId + unaccent + news + contradiction + approvalRate/partyHistory + fix_photo_urls |
| Dados reais        | ✅ 12 candidatos com bios + fotos locais + 5 propostas Gemini + approvalRate        |
| Fotos              | ✅ Hospedadas em /public/images/candidates/ (sem dependência externa, 12 JPEGs)    |
| Enriquecimento LLM | ✅ Gemini Deep Search (manual) → seed + migration aplicada em produção              |
| CI/CD              | ✅ Vercel (web) + Railway (API via git push) + migrations independentes no Actions  |
| UX básica          | ✅ bioSummary + approvalRate (badge + barra de progresso) na página do candidato    |

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

- [ ] Baixar CSV de candidatos registrados *(disponível após agosto/2026)*
- [ ] Importar declaração de bens 2026 *(disponível após agosto/2026)*
- [ ] Importar dados de financiamento de campanha 2026 *(disponível após agosto/2026)*
- [ ] Parser e inserção no banco

#### 1.3.1 — Histórico de bens TSE (atacável agora) ✅

O TSE disponibiliza declarações de bens de eleições anteriores via CSV público.
Candidatos que concorreram em 2018 e/ou 2022 já têm histórico importável agora.

- [x] Baixar CSVs de bens patrimoniais 2018 e 2022 de `dadosabertos.tse.jus.br/dados/bem_candidato`
- [x] Criar script `importTseHistorico.ts` em `packages/scraper/src/jobs/`
  - Match por nome normalizado (unaccent + lowercase) contra candidatos do seed
  - Upsert em `AssetDeclaration` (year, totalValue, sourceUrl)
  - Idempotente: ignorar candidatos sem match
- [x] Adicionar job `import-tse-historico` no `scraper.yml` (workflow_dispatch manual)
- [x] Validar no Prisma Studio que bens 2018/2022 aparecem nos candidatos corretos

**Fonte:** `https://dadosabertos.tse.jus.br/dados/bem_candidato`
*(arquivos: `bem_candidato_2018.csv`, `bem_candidato_2022.csv` — ~400MB cada, filtrar por CPF/nome)*

#### 1.3.2 — Histórico de financiamento de campanha TSE ✅

Prestação de contas de campanhas anteriores (receitas + despesas) via CSV público.

- [x] Baixar ZIPs de prestação de contas 2018 e 2022 de `cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/`
- [x] Criar script `importTseFinanciamento.ts` em `packages/scraper/src/jobs/`
  - Stream `receitas_candidatos_YYYY_BRASIL.csv` → soma VR_RECEITA + top 10 doadores
  - Stream `despesas_contratadas_candidatos_YYYY_BRASIL.csv` → soma VR_DESPESA_CONTRATADA
  - Match por nome normalizado contra candidatos do seed (mesma lógica do bens)
  - Upsert em `CampaignFinancing` (year, totalReceived, totalSpent, donors JSON, sourceUrl)
- [x] Adicionar job `import-tse-financiamento` no `scraper.yml` (workflow_dispatch manual)
- [x] Validar: 9 registros 2018 + 14 registros 2022 importados com sucesso

**Fonte:** `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_YYYY.zip`

### 1.4 — Seed manual de candidatos (MVP) ✅

- [x] Criar seed com os candidatos presidenciais confirmados (8 candidatos)
- [x] Criar seed com candidatos a governador dos 7 estados prioritários (SP, MG, RJ, RS, BA, PR, GO)
- [x] `pnpm db:seed` em `packages/api` — `prisma/seed.ts`
- [x] Seed prioriza valores existentes no banco (Gemini imports) sobre defaults hardcoded
- [x] `partyHistory` dos 8 presidenciáveis no seed (DB ganha se já preenchido)

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
- [x] Sitemap dinâmico (`app/sitemap.ts`) — home, busca, comparar + todos os candidatos
- [x] `loading.tsx` para home (8 skeletons) e busca (6 skeletons)

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

### 5.2 — Monitoramento de notícias ✅

- [x] Gemini Search Grounding para rastrear declarações recentes (`newsProcessor.ts`)
- [x] `NewsItem` model no banco com migration (`20260327000000_add_news_items`)
- [x] Job semanal `weeklyNews.ts` — itera candidatos × 5 temas, salva no banco
- [x] Endpoint `GET /api/candidates/:slug/news` — retorna itens ordenados por data
- [x] GitHub Actions job `weekly-news` em `scraper.yml`
- [x] Alertas de contradição — `contradictionDetector.ts` + campos `hasContradiction`/`contradictionNote` no `NewsItem`; `weeklyNews.ts` detecta ao salvar; `?contradictionsOnly=true` no endpoint
- [x] **UI: `NewsPanel.tsx`** — exibir declarações recentes na página do candidato *(Fase 6)*

### 5.3 — Deploy em produção ✅

- [x] CI/CD com GitHub Actions:
  - `ci.yml` — type check + build em PRs e push para develop
  - `deploy-web.yml` — deploy Next.js para Vercel em push para main
  - `deploy-api.yml` — deploy API para Railway (via git integration) + migrate independente no Actions
  - `scraper.yml` — sync diário (Câmara/Senado), semanal (sites + LLM), `import-gemini`, `populate`, `fix-migration`
- [x] Job `migrate` desacoplado do job `deploy` — migrations rodam independentemente via `PROD_DATABASE_URL`
- [x] Domínio `raio-x-2026.com.br` apontando para Vercel (Hostinger DNS)
- [x] Secrets configurados: `PROD_DATABASE_URL`, `PROD_REDIS_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`
- [x] Monitoramento de uptime — `GET /health` com checks de DB + Redis; configurar UptimeRobot (ver abaixo)
- [x] Railway GitHub App reautorizado para repo privado

### 5.4 — Lançamento público

- [ ] Cobertura dos candidatos presidenciais confirmados (pós-convenções, agosto)
- [ ] 7 estados prioritários com governadores
- [ ] Divulgação

---

## Fase 6 — UX Frontend (próxima fase)

> Melhorar a experiência do usuário final antes do lançamento público.

### 6.1 — Painel de notícias

- [x] `NewsPanel.tsx` — lista de declarações recentes consumindo `GET /api/candidates/:slug/news`
- [x] Destacar itens com `hasContradiction: true` (badge vermelho "Contradição detectada")
- [x] Link para fonte original (`sourceUrl`)
- [x] Integrar na página do candidato (`/candidatos/[slug]`)

### 6.2 — Responsividade mobile

- [x] Header do candidato (foto + nome + badges) — stack vertical em telas < 640px
- [x] `ProposalBlock` — accordion legível em mobile
- [x] Tabela de votações (`TransparencyPanel`) — scroll horizontal ou cards em mobile
- [x] Comparador — tabs de tema empilhadas verticalmente em mobile

### 6.3 — Empty states

- [x] Votações: "Histórico de votações não disponível para este candidato"
- [x] Bens: "Declaração de bens disponível após agosto de 2026 (TSE)"
- [x] Financiamento: "Dados de financiamento disponíveis após agosto de 2026 (TSE)"
- [x] Notícias: "Nenhuma declaração recente encontrada"
- [x] Propostas: "Propostas serão adicionadas após as convenções partidárias (julho de 2026)"

### 6.4 — Melhorias no CandidateCard e home

- [x] `approvalRate` badge no card da listagem (quando disponível)
- [x] Preview de 1 proposta no card (tooltip ou subtítulo)
- [x] Skeleton loading nos cards (`CandidateCardSkeleton` exportado)

### 6.5 — Filtros de proposta por tema

- [x] Pills/tabs de tema na página do candidato (economia, saúde, educação, segurança, meio ambiente)
- [x] Atualização de URL sem reload ao trocar de tema (`?tema=economia`)

---

## Calendário eleitoral de referência

| Data                | Evento                                       |
| ------------------- | -------------------------------------------- |
| 20 jul – 5 ago 2026 | Convenções partidárias                       |
| 15 ago 2026         | Prazo final de registro de candidatos no TSE |
| **4 out 2026**      | **1º turno**                                 |
| 25 out 2026         | 2º turno (se necessário)                     |

---

## Configurar UptimeRobot (manual)

1. Acesse https://uptimerobot.com e crie uma conta gratuita
2. Clique em **Add New Monitor** → tipo **HTTP(s)**
3. **Monitor 1 — API health**
   - URL: `https://api-production-bf20.up.railway.app/health`
   - Interval: 5 minutes
   - Alert contact: seu e-mail
4. **Monitor 2 — Frontend**
   - URL: `https://raio-x-2026.com.br`
   - Interval: 5 minutes
   - Alert contact: seu e-mail
5. O endpoint `/health` retorna HTTP 200 com `{ status: "ok", db: "ok", redis: "ok" }` quando tudo está bem, ou HTTP 503 com `status: "degraded"` em caso de falha.

---

## Próxima ação imediata

**→ Fase 6: UX frontend (packages/web/ apenas)**

O site está no ar com dados reais e fotos locais. Backend de notícias pronto. Próximas prioridades em ordem de impacto:

1. ✅ **Fotos** — 12 JPEGs locais em `/public/images/candidates/`. Sem dependência externa.
2. ✅ **UX básica** — `bioSummary` + `approvalRate` (badge + barra de progresso) na página do candidato.
3. **NewsPanel** — `NewsPanel.tsx` consumindo `GET /api/candidates/:slug/news` (backend pronto, endpoint estável).
4. **Empty states** — Mensagens contextuais quando não há dados (votos, bens, notícias, propostas).
5. **Responsividade mobile** — Header do candidato, ProposalBlock, tabela de votações.
6. **CandidateCard melhorado** — `approvalRate` badge na listagem + skeleton loading.
7. **Pré-convenções (julho/2026)** — Atualizar candidatos confirmados, PDFs de programas de governo.
8. **TSE (agosto/2026)** — Importar declaração de bens e financiamento de campanha quando disponíveis.
