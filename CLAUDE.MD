# CLAUDE.md — Raio-X 2026

Plataforma de transparência eleitoral brasileira para as Eleições Gerais de outubro de 2026.
Consolida propostas, histórico legislativo e dados de transparência de candidatos a presidente e governador.

---

## Documentação do projeto

Antes de qualquer coisa, leia os arquivos abaixo na ordem:

1. `ROADMAP.md` — fases, tasks e próximos passos (com checkboxes de progresso)
2. `ARCHITECTURE.md` — arquitetura geral, diagrama e decisões técnicas
3. `DATA_SOURCES.md` — endpoints exatos das APIs públicas + prompts LLM
4. `API.md` — referência dos endpoints REST internos
5. `SCRAPER.md` — estrutura do scraper, jobs e estratégias
6. `LLM.md` — prompts prontos, providers e casos de uso
7. `CONTRIBUTING.md` — setup, fluxo Git e padrões de código

---

## Estrutura do monorepo

```
raio-x-2026/
├── packages/
│   ├── api/                  # Backend Express + Prisma + PostgreSQL
│   │   ├── src/
│   │   │   ├── routes/       # candidates, proposals, comparison, transparency
│   │   │   ├── controllers/
│   │   │   ├── services/     # candidateService, proposalService, geminiService
│   │   │   ├── middleware/   # errorHandler, rateLimiter
│   │   │   └── types/
│   │   └── prisma/
│   │       └── schema.prisma
│   ├── web/                  # Frontend Next.js 14 App Router
│   │   ├── app/
│   │   │   ├── (home)/page.tsx
│   │   │   ├── candidatos/[slug]/page.tsx
│   │   │   └── comparar/page.tsx
│   │   └── components/
│   └── scraper/              # Coleta de dados
│       └── src/
│           ├── sources/      # camara, senado, tse, candidateSites
│           ├── processors/   # geminiProcessor, groqProcessor, proposalExtractor
│           ├── jobs/         # dailySync, weeklyProposals
│           └── utils/        # playwright, httpClient, logger
├── docs/                     # Documentação completa
├── docker-compose.yml
└── .env
```

---

## Stack

| Camada                 | Tecnologia                              |
| ---------------------- | --------------------------------------- |
| Frontend               | Next.js 14, App Router, Tailwind CSS    |
| Backend                | Node.js, Express, TypeScript            |
| ORM                    | Prisma                                  |
| Banco                  | PostgreSQL                              |
| Cache                  | Redis                                   |
| Scraping               | Playwright + Node.js                    |
| LLM                    | Groq (dev/MVP) ou Gemini Pro (produção) |
| Jobs                   | node-cron                               |
| Gerenciador de pacotes | pnpm (workspaces)                       |

---

## Infraestrutura local

```bash
# Subir serviços
docker-compose up -d

# Verificar status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

| Serviço       | URL                   | Porta                                             |
| ------------- | --------------------- | ------------------------------------------------- |
| Web (Next.js) | http://localhost:3000 | 3000                                              |
| API (Express) | http://localhost:3001 | 3001                                              |
| PostgreSQL    | localhost:5433        | 5433 (local usa 5433 pois 5432 já estava ocupado) |
| Redis         | localhost:6379        | 6379                                              |

> ⚠️ PostgreSQL está na porta **5433**, não 5432. O DATABASE_URL no .env já reflete isso.

---

## Variáveis de ambiente (.env na raiz)

```env
# Banco
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/raiox2026"
REDIS_URL="redis://localhost:6379"

# LLM — usar GROQ por padrão (Gemini free tier com problema de quota)
LLM_PROVIDER=groq
GROQ_API_KEY=         # console.groq.com — free tier real, funciona na hora
GEMINI_API_KEY=       # aistudio.google.com — free tier com bug no projeto atual

# APIs governamentais (públicas, sem autenticação)
CAMARA_API_URL=https://dadosabertos.camara.leg.br/api/v2
SENADO_API_URL=https://legis.senado.leg.br/dadosabertos
TSE_API_URL=https://dadosabertos.tse.jus.br
```

> O `.env` fica na raiz e é linkado via symlink em `packages/api` e `packages/web/.env.local`.

---

## Comandos úteis

```bash
# Instalar dependências
pnpm install

# Rodar tudo em desenvolvimento
pnpm dev

# Rodar só a API
cd packages/api && pnpm dev

# Rodar só o frontend
cd packages/web && pnpm dev

# Migrations do banco
cd packages/api && pnpm prisma migrate dev

# Visualizar banco (Prisma Studio)
cd packages/api && pnpm prisma studio

# Rodar scrapers manualmente
cd packages/scraper
pnpm run sync:camara        # sincroniza votações e PLs da Câmara
pnpm run sync:senado        # sincroniza votações e PLs do Senado
pnpm run process:proposals  # processa propostas com LLM
pnpm run sync:all           # todos os jobs
```

---

## Infraestrutura de produção (deploy atual)

| Serviço    | Plataforma | URL / domínio                              |
| ---------- | ---------- | ------------------------------------------ |
| Frontend   | Vercel     | raio-x-2026.com.br (projeto: "web")        |
| API        | Railway    | api-production-bf20.up.railway.app → :3001 |
| PostgreSQL | Railway    | postgres.railway.internal:5432             |
| Redis      | Railway    | (configurado via REDIS_URL)                |

### DNS (Hostinger)
- `@` → ALIAS + A `76.76.21.21` (Vercel)
- `www` → CNAME `cname.vercel-dns.com`
- `api` → CNAME `api-production-bf20.up.railway.app`

### Variáveis de ambiente — Vercel (projeto "web")
- `NEXT_PUBLIC_API_URL` = `https://api-production-bf20.up.railway.app` (usar o domínio direto do Railway enquanto o CNAME api. não propaga)

### Variáveis de ambiente — Railway (serviço API)
- `DATABASE_URL` = URL interna do PostgreSQL Railway
- `REDIS_URL` = URL interna do Redis Railway
- `FRONTEND_URL` = `https://raio-x-2026.com.br`
- `GROQ_API_KEY` = chave do Groq

---

## Decisões importantes já tomadas

### LLM: Groq em vez de Gemini (por enquanto)

O Gemini foi configurado via Google Cloud Console e o free tier ficou com `limit: 0` (bug de ativação). Usar **Groq** como provider padrão no desenvolvimento e MVP — free tier real, sem configuração de billing, latência muito baixa. Migrar para Gemini quando/se resolver, principalmente para usar o Search Grounding em produção.

Para criar API key Groq: `https://console.groq.com` → API Keys → Create.
Modelo a usar: `llama-3.3-70b-versatile`.

### Porta do PostgreSQL: 5433

A porta padrão 5432 já estava em uso por um PostgreSQL local na máquina de desenvolvimento. O docker-compose mapeia `5433:5432`.

### Monorepo com pnpm workspaces

API, web e scraper compartilham tipos TypeScript. O monorepo evita duplicação de tipos como `Candidate`, `Proposal`, `VotingRecord`.

### SSG + ISR no Next.js

Páginas de candidatos são geradas estaticamente em build time (`generateStaticParams`) com revalidação a cada 24h via ISR. Zero custo de server rendering por request.

### Git: trunk-based

- Branch principal: `main`
- Branch de desenvolvimento: `develop`
- Features: `feat/nome`, Fixes: `fix/nome`
- Regra: qualquer branch mergeada em `main` deve ser mergeada **diretamente** em `develop`. Nunca mergear `main` em `develop`.

### API rodando com `tsx` (não `node dist/`)

O start script usa `tsx src/index.ts` diretamente. Isso evita o bug do Railway onde o build cache reaproveita o `dist/` compilado antigo, ignorando mudanças no código. `tsx` está em `dependencies` (não devDependencies) para estar disponível em produção.

### Slug do candidato: coluna no banco + fallback por estado

O modelo `Candidate` tem `slug String? @unique`. O seed popula o slug em cada startup. `getCandidateBySlug` primeiro tenta `findFirst({ where: { slug } })` (lookup direto) e cai no fallback que filtra por estado e compara com `makeSlug` em JavaScript. **Não usar `ILIKE 'nome%'` no PostgreSQL** — nomes acentuados como "Flávio" não casam com `ILIKE 'flavio%'`.

### `withCache` não cacheia `null`

`null` serializado vira a string `"null"` no Redis. `if (cached)` para `"null"` é truthy, então `null` seria retornado eternamente. Correção: só chamar `setex` se `result != null`. Também: flushar `candidates:*` no startup via `invalidate('candidates:*')` para limpar nulls estagnados de antes do seed rodar.

### `trust proxy` no Express (Railway)

Railway fica atrás de um proxy reverso. Sem `app.set('trust proxy', 1)`, o `express-rate-limit` lança `ValidationError` em toda requisição (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).

### TransparencyPanel usa `candidateSlug` (não `candidate.id`)

O endpoint de transparência é `/api/candidates/:slug/transparency`. O componente deve receber `candidateSlug={params.slug}` (o slug da URL), não `candidate.id` (o UUID do banco).

### Vercel SSG: rebuild necessário após corrigir a API

Quando `generateStaticParams` inclui um slug e o Railway retorna 404 para aquele slug na hora do build, o Vercel gera uma página 404 estática. Mesmo após corrigir a API, essa página 404 fica em cache. Solução: rodar `vercel --prod --yes` após confirmar que a API responde 200 para todos os slugs.

### Migrations manuais (não `prisma migrate dev` no Railway)

Railway usa `prisma migrate deploy` (não `dev`). Criar migrations manualmente em `prisma/migrations/YYYYMMDDHHMMSS_nome/migration.sql`. Sempre incluir `IF NOT EXISTS` no SQL para idempotência.

### Dois projetos duplicados no Vercel

O correto é o projeto **"web"** com domínio `raio-x-2026.com.br`. O outro ("raio-x-2026" com `raio-x-2026.vercel.app`) deve ser deletado em Settings → Delete Project.

### Pipeline de população de dados reais (`populateRealData.ts`)

`syncCamara/syncSenado` criam registros Candidate próprios (keyed por `camaraId`/`senadoId`) e nunca linkam aos candidatos do seed. O `populateRealData.ts` resolve isso com dois passos:

1. **Link**: consulta a API do Senado, normaliza nomes (NFD + lowercase), faz fuzzy match com candidatos do seed, salva `senadoId` no candidato existente.
2. **Sync**: com o `senadoId` correto, sincroniza votos (`saveSenadoVotes`) e matérias (`saveSenadoMaterias`) para o ID certo no banco.
3. **Sites**: chama `loadCandidateSiteConfigs()` + `syncCandidateSites()` para scraping Playwright + extração Groq.

Scripts adicionados ao `packages/scraper/package.json`:
- `populate` — executa tudo (link senado + sites)
- `populate:senado` — só link + votes + bills
- `populate:sites` — só scraping de sites

Para rodar manualmente contra produção, use `DATABASE_PUBLIC_URL` do painel Railway → serviço Postgres → Variables. Nunca commitar essa URL.

### SiteUrls corretos dos candidatos (seed.ts)

URLs verificadas que funcionam:
- Flávio Bolsonaro: `https://www.flaviobolsonaro.net` (`.com` tem erro de certificado)
- Ronaldo Caiado: `http://ronaldocaiado.com.br` (HTTPS tem cert error; usar HTTP)
- `caiado.com.br` → revenda de pneus (não é o político)
- `zema.com.br` → empresa de materiais de construção (não é o político)
- `tarcisiodefreitas.com.br` → DNS não resolve
- `eduardoleite.com.br` → timeout

### Patrimônio e financiamento: TSE só disponível após agosto 2026

`AssetDeclaration` e `CampaignFinancing` dependem de dados do TSE que só ficam disponíveis após o prazo de registro de candidatos (15/ago/2026). Essas seções estarão zeradas para todos os candidatos até lá — comportamento correto, não é bug.

### Redis: flushar cache após popular dados

Após rodar `populateRealData`, o Redis pode ter nulls ou dados vazios em cache (TTL 1h). Solução mais rápida: `railway redeploy --service API --yes` → o startup da API faz `invalidate('candidates:*')`. Alternativa: aguardar TTL expirar (~1h).

### NEXT_SESSION.md deve ficar no .gitignore

O arquivo NEXT_SESSION.md (notas de sessão) pode conter URLs de banco, API keys e outros segredos temporários. Está agora no `.gitignore` para nunca ser commitado. GitGuardian detectou vazamento de `DATABASE_PUBLIC_URL` do Railway em commit anterior — rotacionar a senha do banco imediatamente se isso ocorrer.

### GitHub Actions: `workflow_dispatch` com opção `populate`

O workflow `scraper.yml` tem 6 opções no `workflow_dispatch`: `populate`, `daily`, `weekly`, `all`, `import-gemini`, `fix-migration`. Usar `populate` para bootstrapping inicial (Playwright, timeout 90min). `import-gemini` aplica os JSONs de `gemini-research/outputs/` na produção via `PROD_DATABASE_URL`.

### Pipeline Gemini Deep Search (enriquecimento manual)

Prompts otimizados por candidato em `packages/scraper/src/data/gemini-research/_prompts/`. Outputs JSON em `packages/scraper/src/data/gemini-research/outputs/` (12 arquivos, um por candidato). O script `importGeminiData.ts`:
- Lê JSONs, valida com Zod, upserta `bio`, `bioSummary`, `photoUrl`, `siteUrl` no candidato
- Cria/atualiza `Proposal` (5 por candidato: economia, segurança, meio ambiente, educação, saúde)
- Preflight idempotente: corrige Renan Santos (MBL → Missão)
- Roda via GitHub Actions job `import-gemini` com `PROD_DATABASE_URL`

### `seed.ts` prioriza banco sobre defaults (CRÍTICO)

O seed roda em cada startup do Railway. Lógica correta: `existing.bio ?? c.bio ?? null` (DB ganha). A lógica errada `c.bio ?? existing.bio` sobrescreve dados Gemini em cada restart. Nunca inverter essa ordem.

### `railway up` vs `railway redeploy`

`railway redeploy` reusa o último build ativo — NÃO puxa o código mais recente do git. Para forçar um build com código local atualizado, usar `railway up --detach` dentro de `packages/api`. Nunca fazer `railway redeploy` depois de `railway up` sem verificar qual build está sendo redeployado.

### Unaccent extension no PostgreSQL

Migration `20260326030000_add_unaccent` habilitada em produção. Função `immutable_unaccent(text)` em plpgsql com `LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public` e `RETURN public.unaccent($1)` — necessário para índice funcional. Sem o `SET search_path = public`, PostgreSQL rejeita a função em índice expressão.

### Componentes frontend da Fase 6 (UX)

- `NewsPanel.tsx` — client component, busca `GET /api/candidates/:slug/news`, exibe badge "Contradição detectada" (vermelho) para `hasContradiction: true`, inclui `contradictionNote`, link para `sourceUrl`, skeleton loading e empty state.
- `CandidateCardSkeleton` — exportado de `CandidateCard.tsx`, usar como fallback em Suspense ou `loading.tsx`.
- `CandidateCard` aceita `approvalRate?: number | null` — badge colorido: verde ≥50%, amarelo ≥35%, vermelho <35%.
- `TransparencyPanel` — empty states contextuais: votações (dados sincronizados diariamente), bens e financiamento (disponíveis após agosto/2026 via TSE). Tabela de votações com `overflow-x-auto` + `min-w-[480px]` para scroll horizontal em mobile.
- Página do candidato (`/candidatos/[slug]`): header stack vertical em mobile (`flex-col sm:flex-row`), seção "Declarações Recentes" após Consistência.

---

## Schema do banco (Prisma — resumo)

```prisma
model Candidate {
  id             String   @id @default(uuid())
  slug           String   @unique
  name           String
  party          String
  state          String?
  office         String   // "president" | "governor"
  bio            String?
  photoUrl       String?
  officialSite   String?
  externalId     String?  // ID na Câmara ou Senado
  approvalRate   Int?
  partyHistory   String[]
  proposals      Proposal[]
  votes          VotingRecord[]
  bills          Bill[]
  assets         AssetDeclaration[]
  financing      CampaignFinancing[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Proposal { ... }        // propostas por tema, extraídas via LLM
model VotingRecord { ... }    // histórico de votações (Câmara/Senado)
model Bill { ... }            // projetos de lei de autoria
model AssetDeclaration { ... } // declaração de bens (TSE)
model CampaignFinancing { ... } // financiamento de campanha (TSE)
```

---

## Fontes de dados (resumo rápido)

| Fonte                | Tipo       | Auth             | Docs                                    |
| -------------------- | ---------- | ---------------- | --------------------------------------- |
| API Câmara           | REST JSON  | Nenhuma          | dadosabertos.camara.leg.br/swagger      |
| API Senado           | REST JSON  | Nenhuma          | legis.senado.leg.br/dadosabertos        |
| TSE                  | CSV + REST | Nenhuma          | dadosabertos.tse.jus.br                 |
| Portal Transparência | REST JSON  | API key gratuita | portaldatransparencia.gov.br/swagger-ui |
| Sites de candidatos  | Scraping   | —                | Playwright                              |

---

## Candidatos prioritários (MVP)

### Presidência (todos os confirmados)

- Lula (PT)
- Flávio Bolsonaro (PL)
- Ronaldo Caiado (União Brasil)
- Romeu Zema (Novo)
- Eduardo Leite (PSD)
- Simone Tebet (MDB)
- Renan Santos (Missão/MBL)
- Aldo Rebelo (Solidariedade)

### Governadores (7 estados prioritários do MVP)

SP, MG, RJ, RS, BA, PR, GO

---

## Calendário eleitoral

| Data                | Evento                                 |
| ------------------- | -------------------------------------- |
| 20 jul – 5 ago 2026 | Convenções partidárias                 |
| 15 ago 2026         | Prazo de registro de candidatos no TSE |
| **4 out 2026**      | **1º turno**                           |
| 25 out 2026         | 2º turno (se necessário)               |

---

## Como iniciar uma nova sessão

Sempre comece lendo este arquivo e o ROADMAP.md:

```
Leia o CLAUDE.md e o ROADMAP.md e me diga onde estamos.
Em seguida, implemente a próxima task pendente.
```

Conforme tasks forem concluídas, marque os checkboxes no ROADMAP.md (`- [ ]` → `- [x]`).
Isso mantém o estado do projeto atualizado entre sessões.
