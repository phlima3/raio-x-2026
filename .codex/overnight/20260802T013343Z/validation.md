# Validation log

### 2026-08-02T01:34Z repository boundary
- Command: `git status --short --branch`; `git branch --show-current`; `git rev-parse HEAD`
- Result: PASS
- Evidence: branch `phlima3/official-data-pipeline-2026`, HEAD `4383a0c4463372e5e484d677efde926a95941303`, sem mudanças preexistentes; apenas `.codex/` após bootstrap.
- Follow-up: preservar essa base e criar checkpoints locais.

### 2026-08-02T01:36Z repository audit
- Command: leituras de README/CLAUDE/docs, manifests, Prisma schema/migrations, jobs/workflows, API e frontend via `Get-Content`/`rg`.
- Result: PASS
- Evidence: monorepo pnpm com API Express/Prisma, web Next 14 e scraper; nenhuma infraestrutura de teste existente; TSE oficial ainda é TODO; Câmara/Senado gravam `Candidate`; filtros públicos não aplicam publicação.
- Follow-up: fechar baseline e iniciar infraestrutura de testes.

### 2026-08-02T01:47Z scheduled Prisma failure
- Command: `gh run list --workflow scraper.yml --limit 12 ...`; `gh run view 30687041481 --log-failed`
- Result: FAIL
- Evidence: 12/12 runs recentes falharam. No run 30687041481, `prisma generate` escreveu em `./../../node_modules/.pnpm/.../@prisma/client`; o passo seguinte retornou `ERROR: Prisma client not generated in API` ao buscar `packages/api/node_modules`.
- Follow-up: substituir instalações por pacote/cópia manual por instalação e generate no workspace.

### 2026-08-02T01:52Z workspace install and Prisma baseline
- Command: `pnpm install --frozen-lockfile`; `pnpm db:generate`
- Result: PASS
- Evidence: 484 pacotes instalados; lockfile sem alteração; Prisma 5.22 gerado em `node_modules/.pnpm/.../@prisma/client`.
- Follow-up: configurar workflows para usar exatamente esse layout suportado.

### 2026-08-02T01:53Z typecheck baseline
- Command: `pnpm --filter @raiox/api exec tsc --noEmit`; equivalentes web/scraper.
- Result: PASS
- Evidence: 3/3 pacotes concluíram com exit code 0.
- Follow-up: repetir após cada fase relevante.

### 2026-08-02T01:54Z build baseline
- Command: `pnpm build`
- Result: PASS
- Evidence: API e scraper compilaram; Next.js compilou e gerou 7 páginas. Aviso não bloqueante preexistente: override da fonte `Bodoni Moda` não encontrado.
- Follow-up: repetir no encerramento.
