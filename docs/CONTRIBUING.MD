# Contribuindo com o Raio-X 2026

Obrigado pelo interesse em contribuir! Este documento explica como o projeto está organizado e como trabalhar nele.

---

## Estrutura do monorepo

```
raio-x-2026/
├── packages/
│   ├── api/          # Backend Express + Prisma
│   ├── web/          # Frontend Next.js 14
│   └── scraper/      # Coleta de dados (Playwright + LLM)
├── docs/             # Documentação do projeto
├── docker-compose.yml
└── .env
```

---

## Setup do ambiente

### Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- pnpm (gerenciador de pacotes)

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-user/raio-x-2026.git
cd raio-x-2026

# 2. Instale as dependências
pnpm install

# 3. Copie o .env
cp .env.example .env
# Preencha as variáveis necessárias

# 4. Suba os serviços
docker-compose up -d

# 5. Rode as migrations
cd packages/api
pnpm prisma migrate dev

# 6. Suba os servidores
pnpm dev  # na raiz do monorepo
```

### Serviços disponíveis após o setup

| Serviço    | URL                   |
| ---------- | --------------------- |
| Frontend   | http://localhost:3000 |
| API        | http://localhost:3001 |
| PostgreSQL | localhost:5433        |
| Redis      | localhost:6379        |

---

## Fluxo de trabalho Git

O projeto segue **trunk-based development**:

- Branch principal: `main`
- Branch de desenvolvimento: `develop`
- Feature branches: `feat/nome-da-feature`
- Fix branches: `fix/nome-do-bug`

### Regra importante

Qualquer branch mergeada em `main` deve ser mergeada **diretamente** em `develop` também. **Nunca** mergear `main` em `develop`.

```bash
# Fluxo correto
git checkout -b feat/camara-scraper
# ... trabalho ...
git checkout develop && git merge feat/camara-scraper
git checkout main && git merge feat/camara-scraper
```

### Commits

Seguimos Conventional Commits:

```
feat: adiciona scraper da API da Câmara
fix: corrige parsing de votações do Senado
chore: atualiza dependências
docs: adiciona documentação do endpoint /candidates
```

---

## Variáveis de ambiente

| Variável         | Descrição                       | Obrigatória                   |
| ---------------- | ------------------------------- | ----------------------------- |
| `DATABASE_URL`   | Connection string PostgreSQL    | Sim                           |
| `REDIS_URL`      | Connection string Redis         | Sim                           |
| `GEMINI_API_KEY` | Chave da API Gemini Pro         | Não (usar Groq como fallback) |
| `GROQ_API_KEY`   | Chave da API Groq (alternativa) | Não                           |
| `TSE_API_URL`    | Base URL da API do TSE          | Sim                           |
| `CAMARA_API_URL` | Base URL da API da Câmara       | Sim                           |
| `SENADO_API_URL` | Base URL da API do Senado       | Sim                           |

---

## Rodando os scrapers manualmente

```bash
cd packages/scraper

# Sincroniza votações da Câmara
pnpm run sync:camara

# Sincroniza dados do Senado
pnpm run sync:senado

# Processa propostas com LLM
pnpm run process:proposals

# Roda todos os jobs
pnpm run sync:all
```

---

## Padrões de código

- TypeScript strict mode em todos os pacotes
- ESLint + Prettier configurados na raiz
- Sem `any` explícito — use tipos ou `unknown`
- Sempre tipar retornos de funções assíncronas
- Logs via `logger.ts` — nunca `console.log` direto em produção
