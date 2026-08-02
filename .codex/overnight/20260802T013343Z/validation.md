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

### 2026-08-02T01:58Z TDD RED — CSV TSE
- Command: `pnpm exec vitest run packages/scraper/test/tse-candidate-csv.test.ts`
- Result: FAIL
- Evidence: módulo público `sources/tse/candidateCsv` ainda não existia; nenhum teste executado.
- Follow-up: implementar o mínimo para o registro UTF-8 citado no teste.

### 2026-08-02T02:00Z TDD GREEN — CSV TSE
- Command: mesmo teste focado; `pnpm --filter @raiox/scraper exec tsc --noEmit`
- Result: PASS
- Evidence: 3 casos cobrem UTF-8, Latin-1 auto, aspas/`;`, nulos, coluna desconhecida e UF inválida; typecheck passa.
- Follow-up: adicionar envelope ZIP.

### 2026-08-02T02:00Z TDD RED — ZIP TSE
- Command: `pnpm exec vitest run packages/scraper/test/tse-candidate-archive.test.ts`
- Result: FAIL
- Evidence: módulo `candidateArchive` ausente.
- Follow-up: implementar seleção de `consulta_cand` e erro tipado.

### 2026-08-02T02:01Z TDD GREEN — ZIP TSE
- Command: `pnpm exec vitest run packages/scraper/test/tse-candidate-csv.test.ts packages/scraper/test/tse-candidate-archive.test.ts`
- Result: PASS
- Evidence: 2 arquivos, 5 testes; ZIP válido selecionado e ZIP inválido rejeitado; scraper typecheck passa.
- Follow-up: integrar o parser ao modelo persistente.

### 2026-08-02T02:07Z additive Prisma migration
- Command: `prisma format`; `prisma validate`; `prisma migrate deploy` contra PostgreSQL 16; `pnpm db:generate`
- Result: PASS
- Evidence: 11 migrations aplicadas, incluindo `20260802020000_official_first_models`; schema válido e client gerado. A migration nova contém apenas criação/alteração aditiva e torna `VotingRecord.candidateId` opcional.
- Follow-up: validar os comportamentos persistentes em integração.

### 2026-08-02T02:10Z TDD GREEN — observability, backfill and mandates
- Command: testes focados `sync-runner`, `backfill-persons` e `legislative-persistence` contra PostgreSQL 16.
- Result: PASS
- Evidence: falha de fonte persiste `DataSyncRun=FAILED` antes de relançar; backfill conhecido preserva IDs/slugs e homônimo ambíguo gera revisão; Câmara/Senado criam somente Person/Mandate.
- Follow-up: integrar fontes remotas aos adapters.

### 2026-08-02T02:13Z TDD GREEN — CKAN/TSE reconciliation
- Command: testes `tse-ckan-client`, `tse-candidate-import`, `tse-sync`; execução oficial `pnpm --filter @raiox/scraper run sync:tse -- --dry-run`.
- Result: PASS
- Evidence: descoberta/download/checksum, importação idempotente e reconciliação passaram. Snapshot oficial: 7 recursos, 3.465 registros parseados, 0 rejeitados e 0 escritas no dry-run.
- Follow-up: manter ausência de presidenciáveis como condição não destrutiva.

### 2026-08-02T02:16Z TDD GREEN — public facade
- Command: Supertest `candidate-public-api.integration.test.ts` nos modos legacy e normalized.
- Result: PASS
- Evidence: lista/stats/detalhe excluem ocultos e cargos não habilitados; modo normalized usa Person sem alterar ID/slug legado.
- Follow-up: aplicar a mesma política aos endpoints auxiliares e consumidores web.

### 2026-08-02T02:18Z TDD GREEN — Câmara pagination/persistence
- Command: `camara-pagination.test.ts`; `legislative-persistence.integration.test.ts`; scraper TypeScript build.
- Result: PASS
- Evidence: todas as páginas ligadas por `rel=next` são percorridas, com proteção de loop; persistência não cria Candidate e separa LegislativeBill de Proposal.
- Follow-up: aplicar o mesmo domínio ao Senado.

### 2026-08-02T02:21Z combined test suites
- Command: `pnpm test:unit`; `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5433/raiox2026_test?schema=public'; pnpm test:integration`
- Result: PASS
- Evidence: 5 arquivos/8 testes unitários e 6 arquivos/12 testes de integração passaram. Uma tentativa anterior em porta 5432 falhou por conexão; a primeira execução conjunta na porta correta expôs e corrigiu limpeza relacional de mandatos entre suites.
- Follow-up: ampliar suites para Senado e documentos, depois repetir ladder completa.

### 2026-08-02T02:25Z TDD RED→GREEN — Senado pagination
- Command: `pnpm exec vitest run packages/scraper/test/senado-pagination.test.ts`
- Result: RED (`collectSenadoPages is not a function`) → PASS
- Evidence: 3 casos cobrem duas próximas páginas, resposta array oficial e detecção de loop; TypeScript scraper passa.
- Follow-up: ligar o collector ao sync persistente.

### 2026-08-02T02:30Z TDD RED→GREEN — Senado normalized sync
- Command: integração focada `senado-sync.integration.test.ts` em PostgreSQL 16.
- Result: RED (`runSenadoSync is not a function`) → PASS
- Evidence: duas execuções mantêm 1 Person, 1 Mandate, 1 LegislativeBill, 1 autoria, 1 voto e 0 Candidate; páginas 2 de processo/votação foram chamadas nas duas execuções.
- Follow-up: observar Câmara pelo mesmo runner.

### 2026-08-02T02:31Z TDD RED→GREEN — Câmara observed sync
- Command: integração focada `camara-sync.integration.test.ts` em PostgreSQL 16.
- Result: RED (`runCamaraSync is not a function`) → PASS
- Evidence: deputado cria Person/Mandate e zero Candidate; erro remoto persiste DataSyncRun FAILED e é relançado.
- Follow-up: executar suites conjuntas.

### 2026-08-02T02:33Z combined legislative suites
- Command: `pnpm test:unit`; `pnpm test:integration` com PostgreSQL 16 em localhost:5433.
- Result: PASS
- Evidence: 6 arquivos/11 testes unitários e 8 arquivos/15 testes de integração passaram.
- Follow-up: implementar documentos oficiais.
