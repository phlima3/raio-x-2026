# Raio-X 2026

Plataforma de transparência eleitoral brasileira para as eleições de 2026.

Consolida dados de candidatos, propostas, histórico de votações, declarações de bens e financiamento de campanha em uma interface unificada, com sumarização automática via Gemini Pro.

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
npm install

# Suba o banco de dados
docker-compose up -d postgres

# Gere o cliente Prisma e rode as migrations
npm run db:generate
npm run db:migrate
```

### 3. Desenvolvimento

```bash
# API + Web em paralelo
npm run dev

# Apenas API
npm run dev:api

# Apenas Web
npm run dev:web

# Scraper manual
npm run scraper:sync

# Snapshot oficial TSE (candidaturas + julgamentos 2026)
pnpm --filter @raiox/scraper sync:tse
```

### 4. Banco de dados

```bash
# Abrir Prisma Studio
npm run db:studio
```

## Fontes de Dados

- **TSE** — `dadosabertos.tse.jus.br` — candidatos, financiamento, bens
- **Câmara dos Deputados** — `dadosabertos.camara.leg.br` — propostas, votações
- **Senado Federal** — `legis.senado.leg.br` — projetos de lei, votações
- **Sites dos candidatos** — Playwright scraping para coleta de propostas programáticas

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
