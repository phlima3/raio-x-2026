# Arquitetura — Raio-X 2026

---

## Visão geral

```
┌─────────────────────────────────────────────────────┐
│                    USUÁRIO (Browser)                 │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              packages/web (Next.js 14)               │
│         SSG/ISR — App Router — Tailwind CSS          │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (interno)
┌──────────────────────▼──────────────────────────────┐
│             packages/api (Express + Node)            │
│         REST API — Rate limiting — Cache             │
└──────┬───────────────┬──────────────────────────────┘
       │               │
┌──────▼──────┐ ┌──────▼──────┐
│  PostgreSQL  │ │    Redis    │
│  (Prisma)   │ │   (Cache)   │
└─────────────┘ └─────────────┘
       ▲
┌──────┴──────────────────────────────────────────────┐
│            packages/scraper (Node + Playwright)      │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ API Câmara  │  │ API Senado  │  │   TSE CSV   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │       Playwright (sites de candidatos)          │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────▼──────────────────────────┐ │
│  │          LLM (Gemini Pro / Groq)                │ │
│  │   Extração de propostas → JSON estruturado      │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Pacotes

### `packages/api`

Backend REST em Express com TypeScript. Responsável por:

- Servir dados de candidatos, propostas, votações
- Cache com Redis (TTL configurável por rota)
- Rate limiting por IP
- Validação de entrada com Zod

**Rotas principais:**

```
GET  /health
GET  /candidates
GET  /candidates/:slug
GET  /candidates/:slug/votes
GET  /candidates/:slug/bills
GET  /candidates/:slug/proposals
GET  /candidates/:slug/assets
GET  /candidates/:slug/financing
GET  /compare?a=:slug&b=:slug
GET  /proposals/themes
```

### `packages/web`

Frontend em Next.js 14 com App Router. Responsável por:

- Interface pública para o eleitor
- SSG para páginas de candidatos (geradas em build time)
- ISR com revalidação a cada 24h
- SEO e OpenGraph

**Rotas:**

```
/                          → Home com busca e filtros
/candidatos/[slug]         → Perfil do candidato
/comparar                  → Comparador lado a lado
```

### `packages/scraper`

Coleta e processamento de dados. Responsável por:

- Consumir APIs governamentais (Câmara, Senado, TSE)
- Scraping de sites de candidatos via Playwright
- Processamento via LLM (extração de propostas)
- Cron jobs de atualização

---

## Fontes de dados

| Fonte               | Tipo           | Frequência de sync | Confiabilidade |
| ------------------- | -------------- | ------------------ | -------------- |
| API Câmara          | REST JSON      | Diária             | ★★★★★          |
| API Senado          | REST JSON      | Diária             | ★★★★☆          |
| TSE (dadosabertos)  | CSV/REST       | Mensal             | ★★★★★          |
| Sites de candidatos | Scraping       | Semanal            | ★★★☆☆          |
| PDFs de programas   | Scraping + LLM | Semanal            | ★★★☆☆          |

---

## Pipeline de dados

```
1. COLETA
   Playwright / API fetch
         │
         ▼
2. PARSING
   HTML → texto limpo / JSON da API
         │
         ▼
3. ENRIQUECIMENTO (quando necessário)
   LLM recebe texto + prompt → JSON de propostas
         │
         ▼
4. VALIDAÇÃO
   Zod schema valida o JSON
         │
         ▼
5. PERSISTÊNCIA
   Prisma upsert no PostgreSQL (idempotente)
         │
         ▼
6. CACHE INVALIDADO
   Redis TTL resetado para as rotas afetadas
```

---

## Decisões técnicas

### Por que monorepo?

API, web e scraper compartilham tipos TypeScript (ex: `Candidate`, `Proposal`). O monorepo evita duplicação e mantém os tipos sincronizados.

### Por que Redis para cache?

As páginas de candidatos têm dados que mudam no máximo 1x por dia. Cache evita queries repetidas ao PostgreSQL e torna a API responsiva mesmo com muitos acessos simultâneos.

### Por que SSG no Next.js?

Páginas de candidatos são praticamente estáticas — mudam no máximo semanalmente. SSG com ISR gera HTML em build time e revalida automaticamente, resultando em performance máxima e zero custo de server rendering por request.

### Por que Playwright e não Cheerio/Axios?

Vários sites de candidatos usam JavaScript para renderizar conteúdo. Playwright executa o JS completo, garantindo que o conteúdo dinâmico seja capturado.

### LLM provider

O projeto suporta dois providers intercambiáveis via variável de ambiente `LLM_PROVIDER`:

- `gemini` → Google Gemini Pro (preferencial, suporta Search Grounding)
- `groq` → Groq API com Llama 3 (fallback, free tier real, sem configuração)
