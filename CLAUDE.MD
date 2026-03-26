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
