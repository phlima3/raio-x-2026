# Raio-X 2026

Plataforma de transparência eleitoral brasileira para as eleições de 2026.

Consolida candidaturas oficiais, propostas de campanha, mandatos, projetos,
votações, bens e contexto jornalístico em uma interface unificada.

O pipeline é official-first: TSE para candidaturas, Câmara/Senado para atividade
legislativa e documentos oficiais para programas. Consulte o
[runbook do pipeline](docs/OFFICIAL_DATA_PIPELINE.md) para arquitetura, comandos,
agenda, rollout e rollback.

## Stack

| Camada    | Tecnologia                                |
|-----------|-------------------------------------------|
| Frontend  | Next.js 14 (App Router) + Tailwind CSS    |
| Backend   | Node.js + Express + Prisma                |
| Banco     | PostgreSQL 16                             |
| Scraping  | Playwright + APIs governamentais          |
| IA        | Google Gemini Pro                         |

## Estrutura do Monorepo

```
raio-x-2026/
├── packages/
│   ├── api/        # REST API (Express + Prisma)
│   ├── web/        # Frontend (Next.js 14)
│   └── scraper/    # Coleta de dados (Playwright + APIs)
├── docker-compose.yml
└── .env.example
```

## Setup

### 1. Pré-requisitos

- Node.js 20+
- Docker + Docker Compose
- Conta Google AI Studio (Gemini API Key)

### 2. Configuração

```bash
# Clone o repositório
git clone https://github.com/phlima3/raio-x-2026.git
cd raio-x-2026

# Copie e preencha as variáveis de ambiente
cp .env.example .env

# Instale as dependências
pnpm install --frozen-lockfile

# Suba o banco de dados
docker-compose up -d postgres

# Gere o cliente Prisma e rode as migrations
pnpm db:generate
pnpm db:migrate
```

### 3. Desenvolvimento

```bash
# API + Web em paralelo
pnpm dev

# Apenas API
pnpm dev:api

# Apenas Web
pnpm dev:web

# Scraper manual
pnpm scraper:sync

# Snapshot oficial TSE (candidaturas + julgamentos 2026)
pnpm --filter @raiox/scraper sync:tse
```

### 4. Banco de dados

```bash
# Abrir Prisma Studio
pnpm db:studio
```

## Fontes de Dados

- **TSE** — `dadosabertos.tse.jus.br` — candidatos, financiamento, bens
- **Câmara dos Deputados** — `dadosabertos.camara.leg.br` — propostas, votações
- **Senado Federal** — `legis.senado.leg.br` — projetos de lei, votações
- **Documentos oficiais** — programas de governo, com deduplicação e extração de PDF
- **Sites e imprensa** — somente enriquecimento/contexto; extrações IA ficam ocultas até revisão

## Licença

MIT

## SEO e qualidade editorial

O sitemap e a diretiva `index` são controlados pelo mesmo gate editorial. Um
perfil incompleto continua público, mas recebe `noindex,follow` até ter status
com fonte, três módulos substantivos, autoria, revisão e aprovação auditáveis.

```bash
# Testes e builds
pnpm --filter @raiox/api test
pnpm --filter @raiox/web test
pnpm --filter @raiox/web typecheck
pnpm --filter @raiox/web lint
pnpm -r build

# Smoke local após o build, relatório e auditoria pós-deploy
pnpm --filter @raiox/web seo:smoke
pnpm --filter @raiox/web seo:quality-report
pnpm --filter @raiox/web seo:audit
```

Consulte [o plano de SEO](docs/SEO_PLAN.md), [o runbook de lançamento](docs/runbooks/SEO_LAUNCH.md)
e [o procedimento editorial](docs/runbooks/EDITORIAL_QUALITY_GATE.md) antes de
aprovar ou enviar URLs ao Google.
