# Migração: Vercel + Railway → Veloz

> Documento gerado para ser lido por um agente de IA que executará a migração.
> Contém contexto do projeto, mapeamento de serviços e instruções passo a passo.

---

## 1. Contexto do projeto

**Raio-X 2026** é um monorepo pnpm com três pacotes:

```
raio-x-2026/
├── packages/
│   ├── api/       # Express + Prisma + PostgreSQL — porta 3001
│   ├── web/       # Next.js 14 App Router — porta 3000
│   └── scraper/   # Jobs de scraping (não é um serviço HTTP, roda via GitHub Actions)
├── package.json   # workspaces: ["packages/*"]
└── veloz.json     # será criado durante a migração
```

O `package.json` raiz usa **yarn workspaces** (`packageManager: yarn@1.22.22`).

---

## 2. Infraestrutura atual (a ser substituída)

| Serviço       | Plataforma atual | URL atual                                  |
|---------------|------------------|--------------------------------------------|
| Frontend web  | Vercel           | `raio-x-2026.com.br` (projeto "web")       |
| API Express   | Railway          | `api-production-bf20.up.railway.app:3001`  |
| PostgreSQL    | Railway          | `postgres.railway.internal:5432`           |
| Redis         | Railway          | via `REDIS_URL`                            |
| DNS           | Hostinger        | `@` → Vercel / `api.` → Railway            |

---

## 3. Infraestrutura alvo (Veloz)

| Serviço      | Tipo Veloz  | Subdomínio automático           |
|--------------|-------------|---------------------------------|
| web          | WEB         | `web-raiox2026.onveloz.com`     |
| api          | WEB         | `api-raiox2026.onveloz.com`     |
| PostgreSQL   | DATABASE    | injetado via env automaticamente|
| Redis        | DATABASE    | injetado via env automaticamente|

Domínio customizado `raio-x-2026.com.br` será apontado para o serviço `web` no Veloz.
Subdomínio `api.raio-x-2026.com.br` será apontado para o serviço `api` no Veloz.

---

## 4. Variáveis de ambiente atuais (Railway/Vercel)

### API (Railway)
```env
DATABASE_URL=postgresql://postgres:<senha>@postgres.railway.internal:5432/railway
REDIS_URL=redis://...
FRONTEND_URL=https://raio-x-2026.com.br
GROQ_API_KEY=<chave>
CAMARA_API_URL=https://dadosabertos.camara.leg.br/api/v2
SENADO_API_URL=https://legis.senado.leg.br/dadosabertos
TSE_API_URL=https://dadosabertos.tse.jus.br
API_PORT=3001
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
SCRAPER_CONCURRENCY=2
SCRAPER_HEADLESS=true
```

### Web (Vercel)
```env
NEXT_PUBLIC_API_URL=https://api-production-bf20.up.railway.app
```

### Notas importantes
- `DATABASE_URL` e `REDIS_URL` serão **injetados automaticamente** pelo Veloz ao criar os bancos. Não definir manualmente.
- `FRONTEND_URL` deve ser atualizado para o novo domínio do serviço `web` no Veloz.
- `NEXT_PUBLIC_API_URL` deve ser atualizado para o novo domínio do serviço `api` no Veloz.

---

## 5. Detalhes dos serviços

### 5.1 — API (`packages/api`)

- **Runtime:** Node.js, TypeScript via `tsx` (não compila para `dist/`)
- **Start script:** `prisma migrate deploy && tsx src/index.ts`
- **Porta:** `process.env.API_PORT ?? 3001`
- **Prisma:** schema em `packages/api/prisma/schema.prisma`
- **`preStartCommand` necessário:** `npx prisma migrate deploy` (Veloz exige isso separado do start)

O `start` script atual do `packages/api/package.json` faz migrate + start.
No Veloz, usar `preStartCommand: "npx prisma migrate deploy"` e
`command: "npx tsx src/index.ts"`. Seed de produção é proibido.

### 5.2 — Web (`packages/web`)

- **Framework:** Next.js 14 App Router
- **Build:** `next build`
- **Start:** `next start`
- **Porta:** 3000
- **⚠️ IMPORTANTE:** O `next.config.mjs` **não usa** `output: "standalone"` — compatível com Veloz sem alteração.
- **Variável obrigatória:** `NEXT_PUBLIC_API_URL` apontando para o domínio da API no Veloz

### 5.3 — PostgreSQL

- Versão atual no Railway: compatível com Prisma 5.x (PostgreSQL 14+)
- Recomendado no Veloz: **PostgreSQL 16**
- Extensão necessária: `unaccent` (usada em buscas). Verificar se Veloz permite `CREATE EXTENSION IF NOT EXISTS unaccent;` via migration SQL — já está nas migrations do projeto.

### 5.4 — Redis

- Versão atual: compatível com ioredis 5.x
- Recomendado no Veloz: **Redis 7**

### 5.5 — Scraper (`packages/scraper`)

- **Não é um serviço HTTP** — roda pelos workflows por fonte em
  `.github/workflows/sync-*.yml` e pelo workflow manual de manutenção
- **Não precisa ser deployado na Veloz**
- Continuará usando `PROD_DATABASE_URL` (secret do GitHub Actions) apontando para o banco público do Veloz

---

## 6. `veloz.json` esperado após migração

```json
{
  "version": "1.0",
  "project": {
    "name": "raio-x-2026",
    "slug": "raiox2026"
  },
  "defaults": {
    "build": {
      "nodeVersion": "20"
    }
  },
  "services": {
    "packages/api": {
      "name": "api",
      "type": "web",
      "branch": "main",
      "build": {
        "method": "nixpacks",
        "command": "cd ../.. && yarn install --frozen-lockfile && cd packages/api && npx prisma generate"
      },
      "runtime": {
        "command": "npx tsx src/index.ts",
        "preStartCommand": "npx prisma migrate deploy",
        "port": 3001
      },
      "databases": ["postgres", "redis"]
    },
    "packages/web": {
      "name": "web",
      "type": "web",
      "branch": "main",
      "build": {
        "method": "nixpacks",
        "command": "cd ../.. && yarn install --frozen-lockfile && cd packages/web && yarn build"
      },
      "runtime": {
        "command": "yarn start",
        "port": 3000
      }
    }
  }
}
```

> ⚠️ Este arquivo será gerado/ajustado pelo CLI Veloz em `veloz deploy`. Use como referência para corrigir após a geração automática.

---

## 7. Passo a passo da migração

### Pré-requisitos
```bash
npm i -g onveloz
veloz login   # abre browser para autenticação
```

### Passo 1 — Criar bancos de dados no Veloz

Via dashboard em `app.onveloz.com` ou CLI:
```bash
# Criar PostgreSQL 16
veloz db create --type postgres --version 16 --name raiox-postgres

# Criar Redis 7
veloz db create --type redis --version 7 --name raiox-redis
```

Anotar as credenciais geradas — o Veloz injeta `DATABASE_URL` e `REDIS_URL` automaticamente nos serviços vinculados.

### Passo 2 — Exportar dados do Railway

```bash
# Obter DATABASE_PUBLIC_URL do Railway
railway run --service Postgres env | grep DATABASE_PUBLIC_URL

# Dump do banco de produção
pg_dump "<DATABASE_PUBLIC_URL>" \
  --no-owner --no-acl \
  -f /tmp/raiox_backup.sql

# Importar no banco Veloz (após criação)
psql "<VELOZ_DATABASE_PUBLIC_URL>" < /tmp/raiox_backup.sql
```

### Passo 3 — Deploy na Veloz

```bash
cd /caminho/para/raio-x-2026

veloz deploy
# O CLI detectará automaticamente o monorepo (workspaces no package.json)
# Selecionar: packages/api e packages/web
# O scraper NÃO deve ser selecionado
```

### Passo 4 — Configurar variáveis de ambiente

```bash
# Variáveis da API
veloz env set FRONTEND_URL=https://raio-x-2026.com.br --service api
veloz env set GROQ_API_KEY=<chave> --service api
veloz env set CAMARA_API_URL=https://dadosabertos.camara.leg.br/api/v2 --service api
veloz env set SENADO_API_URL=https://legis.senado.leg.br/dadosabertos --service api
veloz env set TSE_API_URL=https://dadosabertos.tse.jus.br --service api
veloz env set API_PORT=3001 --service api
veloz env set RATE_LIMIT_MAX_REQUESTS=100 --service api
veloz env set RATE_LIMIT_WINDOW_MS=60000 --service api
veloz env set SCRAPER_CONCURRENCY=2 --service api
veloz env set SCRAPER_HEADLESS=true --service api

# Variáveis do Frontend: privada em runtime e pública no browser/build
veloz env set API_URL_INTERNAL=http://api:3001 --service web
veloz env set NEXT_PUBLIC_API_URL=https://api-raiox2026.onveloz.com --service web
```

> `DATABASE_URL` e `REDIS_URL` são injetados automaticamente — não setar manualmente.

### Passo 5 — Configurar domínio customizado

```bash
# Domínio principal → serviço web
veloz domain add raio-x-2026.com.br --service web
veloz domain add www.raio-x-2026.com.br --service web

# Subdomínio de API → serviço api
veloz domain add api.raio-x-2026.com.br --service api
```

Após isso, atualizar DNS na Hostinger:
- `@` → CNAME ou A para o endereço fornecido pelo Veloz (substituindo o Vercel)
- `www` → CNAME para o endereço fornecido pelo Veloz
- `api` → CNAME para o endereço da API no Veloz (substituindo Railway)

### Passo 6 — Atualizar GitHub Actions (scraper)

O secret compartilhado `PROD_DATABASE_URL` deve ser atualizado no painel do
GitHub (`Settings → Secrets`) para os workflows `sync-tse.yml`,
`sync-legislative.yml`, `sync-documents.yml`, `sync-sites.yml`, `sync-news.yml`
e `manual-data-jobs.yml`.

```bash
# Obter a URL pública do banco Veloz
veloz db url raiox-postgres --public
```

### Passo 7 — Atualizar CORS na API

Em `packages/api/src/index.ts`, o array `corsOrigins` já inclui `process.env.FRONTEND_URL` — nenhuma alteração de código necessária, desde que a variável esteja corretamente setada.

### Passo 8 — Validar e desligar infra antiga

1. Testar `https://raio-x-2026.com.br` — página carrega com dados
2. Testar `https://api.raio-x-2026.com.br/health` — retorna `{ status: "ok", db: "ok", redis: "ok" }`
3. Testar uma página de candidato (ex: `/candidatos/lula-pt-sp`)
4. Somente após validação:
   - Deletar projeto "web" do Vercel
   - Deletar serviços API + Postgres + Redis do Railway

---

## 8. Pontos de atenção / armadilhas

| Ponto | Detalhe |
|-------|---------|
| `output: standalone` no Next.js | **Não usar** — o `next.config.mjs` atual não usa, ok. |
| `prisma generate` no build | A action local `setup-pipeline` instala na raiz e executa `pnpm db:generate`; não procurar o client em `packages/api/node_modules`. |
| `preStartCommand` para migrations | Separar do `start` script — Veloz executa `preStartCommand` antes do processo principal. |
| Extensão `unaccent` do PostgreSQL | Criada via migration SQL (`20260326030000_add_unaccent`). Verificar se o PostgreSQL do Veloz permite extensões de terceiros. |
| `trust proxy` no Express | `app.set('trust proxy', 1)` já está em `src/index.ts` — necessário pois Veloz também usa proxy reverso. |
| Porta da API | Configurada via `process.env.API_PORT ?? 3001`. Garantir que o Veloz expõe a porta correta. |
| Seed no startup | Não executar. O seed é um bootstrap explícito de desenvolvimento. |
| `DATABASE_PUBLIC_URL` para scraper | Após migração, atualizar o secret `PROD_DATABASE_URL` no GitHub Actions com a URL pública do banco Veloz. |

---

## 9. Arquivos a NÃO modificar

- `packages/web/next.config.mjs` — não adicionar `output: "standalone"`
- `packages/api/prisma/schema.prisma` — alterar somente junto de migration aditiva
- `.github/workflows/sync-*.yml` — os secrets são configurados no painel, nunca no arquivo

---

## 10. Referências

- Veloz docs: https://onveloz.com/docs
- Veloz `veloz.json` reference: https://onveloz.com/docs/veloz-json
- Veloz monorepo guide: https://onveloz.com/docs/monorepo
- Veloz CLI: `npm i -g onveloz`
- Dashboard: https://app.onveloz.com
