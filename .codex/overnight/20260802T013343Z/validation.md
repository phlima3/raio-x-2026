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

### 2026-08-02T02:34Z TDD RED→GREEN — PDF text layer
- Command: `pnpm exec vitest run packages/scraper/test/pdf-text.test.ts`
- Result: RED (módulo ausente) → PASS
- Evidence: PDF sintético digital extrai texto; PDF válido sem texto retorna string vazia; scraper typecheck passa com pdfjs-dist.
- Follow-up: persistir estados de documento.

### 2026-08-02T02:37Z TDD RED→GREEN — official documents
- Command: integração focada `tse-documents.integration.test.ts` em PostgreSQL 16.
- Result: RED (módulo ausente) → PASS
- Evidence: 3 casos: nenhum PDF=NOOP, repetido mantém uma linha/extrai uma vez, vazio=NEEDS_OCR, digital=EXTRACTED com texto.
- Follow-up: aplicar política de invisibilidade a extrações IA.

### 2026-08-02T02:40Z AI proposal visibility and migration
- Command: migrate deploy da migration `20260802024000_hide_unreviewed_ai_proposals`; Supertest da API pública.
- Result: PASS
- Evidence: proposta editorial aparece e extração IA oculta não aparece no detalhe nem agrupamento público; migrations totalizam 12 nesse ponto.
- Follow-up: importar datasets auxiliares disponíveis.

### 2026-08-02T02:44Z TDD RED→GREEN — supplemental TSE datasets
- Command: integração focada `tse-supplemental.integration.test.ts`; migration `20260802025000_official_dataset_records`; generate/typecheck.
- Result: RED (módulo ausente) → PASS
- Evidence: 6 recursos sintéticos/6 linhas após reprocessar duas vezes mantêm 6 snapshots e 6 registros; payload não contém CPF; bens somam BRL 150000,75 e status/coligação/rede materializam.
- Follow-up: validar contra catálogo oficial.

### 2026-08-02T02:45Z official supplemental/document dry-runs
- Command: `sync:tse:supplemental -- --dry-run`; `sync:documents -- --dry-run` contra catálogo oficial.
- Result: PASS
- Evidence: suplementar SUCCESS com 6 recursos e 25.493 registros; documentos NOOP com 0 recursos/PDFs, coerente com o catálogo observado.
- Follow-up: manter job diário de documentos para detectar publicação futura.

### 2026-08-02T02:53Z combined documents/supplemental suites
- Command: `pnpm test:unit`; `pnpm test:integration` com PostgreSQL 16 em localhost:5433.
- Result: PASS
- Evidence: 7 arquivos/13 testes unitários e 10 arquivos/19 integrações passaram.
- Follow-up: finalizar CI, operação e review.

### 2026-08-02T03:10Z TDD RED→GREEN — bidirectional identity reconciliation
- Command: integrações focadas `tse-candidate-import.integration.test.ts` e `legislative-persistence.integration.test.ts` em PostgreSQL 16.
- Result: RED (TSE criava uma segunda Person e publicava caso ambíguo) → PASS.
- Evidence: 2 arquivos/10 testes; match exato por nome/cargo/partido/UF reutiliza Person em qualquer ordem de sync, enquanto dois matches mantêm três pessoas separadas, ocultam a candidatura e criam ReviewItem.
- Follow-up: validar migrations do zero e a ladder completa.

### 2026-08-02T03:16Z clean PostgreSQL 16 migration
- Command: criar `raiox2026_fresh_20260802_test`; `prisma validate`; `prisma migrate deploy`; `prisma migrate status`.
- Result: PASS.
- Evidence: schema válido; 13/13 migrations aplicadas do zero; database schema up to date. A migration preserva candidaturas editoriais preexistentes de presidente/governador/senador.
- Follow-up: usar exclusivamente esse banco na suite final.

### 2026-08-02T03:17Z full validation ladder
- Command: `pnpm install --frozen-lockfile`; `pnpm db:generate`; `pnpm test:unit`; `pnpm test:integration`; `pnpm typecheck`; `pnpm build`.
- Result: PASS.
- Evidence: lockfile aceito; Prisma gerado no `.pnpm` raiz; 7 arquivos/13 testes unitários e 10 arquivos/23 integrações; typecheck dos 3 pacotes; builds API/scraper e Next com 7 páginas concluídos.
- Note: Next mantém aviso não bloqueante preexistente de override de `Bodoni Moda` e depreciação `punycode`.
- Follow-up: review final.

### 2026-08-02T03:18Z workflow and review CLI validation
- Command: `yaml-lint` em action + 7 workflows; `review:report`; `git diff --check`.
- Result: PASS.
- Evidence: YAML válido; relatório CLI retornou JSON válido sem payloads; diff sem whitespace errors.
- Follow-up: review final.

### 2026-08-02T03:17Z lint baseline
- Command: `pnpm lint`; `pnpm --filter @raiox/web lint`.
- Result: NOT CONFIGURED (non-blocking).
- Evidence: a API declara `eslint` sem dependência/config e o Next solicita configuração interativa; esse defeito já existia no baseline. Typecheck e o lint/check interno do build Next passaram.
- Follow-up: registrar como dívida separada, sem ampliar o escopo do pipeline.

### 2026-08-02T03:23Z two-axis review skill
- Command: `git diff 4383a0c...HEAD`; subreviews paralelos Standards e Spec conforme `review/SKILL.md`.
- Result: Standards PASS (0 achados); Spec 2 altos, 4 médios e 1 baixo antes das correções.
- Evidence: migração de votos/projetos e falha engolida em proposalExtractor foram altas; lifecycle de revisão IA, documentos, cargo vice-prefeito, campos internos da fachada e relatório foram demais achados.
- Follow-up: corrigir todos os locais; tratar documentos pela evidência oficial de disponibilidade.

### 2026-08-02T03:24Z TDD RED→GREEN — sensitive future columns
- Command: `tse-candidate-csv.test.ts`.
- Result: RED (coluna futura `CPF_CANDIDATO_V2` aparecia em columns/raw) → PASS.
- Evidence: sanitizer agora rejeita qualquer nome de coluna contendo CPF ou título eleitoral, inclusive em linhas rejeitadas e metadados de colunas.
- Follow-up: review de segurança dos testes de integração.

### 2026-08-02T03:34Z TDD RED→GREEN — migration and facade findings
- Command: testes focados API pública, importador TSE e persistência legislativa.
- Result: RED nos três achados → PASS (3 arquivos/13 testes).
- Evidence: voto legado recebe personId/mandateId mantendo candidateId; projeto legado vira LegislativeBill+autoria e Proposal oculta; 13 cargos TSE são armazenados; detalhe não expõe personId/syncRunId/raw/source internos.
- Follow-up: validar lifecycle de revisão IA.

### 2026-08-02T03:35Z TDD RED→GREEN — reviewed AI proposal
- Command: `ai-proposal-review.integration.test.ts`.
- Result: RED (`persistExtractedProposals` inexistente) → PASS.
- Evidence: reprocessamento mantém título/conteúdo/status/publicação/reviewedAt aprovados; os três importadores pulam rows já revisadas.
- Follow-up: ladder final.

### 2026-08-02T03:38Z official document availability revalidation
- Command: busca no catálogo oficial TSE 2026 e comparação com recursos oficiais 2024.
- Result: PASS com limitação externa documentada.
- Evidence: 2026 descreve proposta de governo mas ainda lista somente 7 recursos CSV; 2024 publica PDFs de proposta por UF no mesmo CKAN e declara CAND/Candex/DivulgaCand como fonte. O client atual aceita PDF direto e ZIP assim que surgirem.
- Follow-up: manter schedule 08:00 UTC e NOOP até recurso real.

### 2026-08-02T03:40Z post-review full ladder
- Command: `prisma format/generate/validate/migrate status`; `pnpm test:unit`; `pnpm test:integration`; `pnpm typecheck`; `pnpm build`; YAML lint; `git diff --check`; `review:report`.
- Result: PASS.
- Evidence: 14 migrations atualizadas; 7 arquivos/13 unitários; 11 arquivos/25 integrações PostgreSQL 16; 3 typechecks e 3 builds; 7 páginas Next; YAML/diff/CLI válidos.
- Follow-up: commit e final-report.

### 2026-08-02T03:44Z final report and persistent-state audit
- Command: inspeção de `final-report.md`, `plan.md`, `progress.md`, `decisions.md`, `blockers.md`, `validation.md` e `state.json`; `git log --oneline -8`; `git status --short --branch`.
- Result: PASS.
- Evidence: cada fase do plano está marcada como concluída; relatório contém os seis checkpoints de implementação, todos os resultados reproduzíveis, limitação externa dos PDFs 2026, riscos e rollout/rollback sem execução externa.
- Follow-up: checkpoint documental e confirmação de worktree limpo.

### 2026-08-02T03:45Z TDD RED→GREEN — TSE ZIP labeled as PDF
- Command: `vitest run --config vitest.integration.config.mts packages/scraper/test/tse-documents.integration.test.ts` contra PostgreSQL 16.
- Result: RED (ZIP inteiro enviado ao extrator) → PASS (4/4 testes).
- Evidence: fixture usa `format: PDF` com assinatura `PK`; após a correção, o extrator recebe apenas o PDF interno e a URL persistida identifica a entrada do ZIP.
- Follow-up: repetir unitários, integrações, typecheck e build completos.

### 2026-08-02T03:47Z post-document-fix full ladder
- Command: `pnpm test:unit`; `pnpm test:integration`; `pnpm typecheck`; `pnpm build` no banco PostgreSQL 16 limpo.
- Result: PASS.
- Evidence: 7 arquivos/13 unitários; 11 arquivos/26 integrações; API, scraper e web passaram typecheck e build; Next gerou 7 páginas.
- Follow-up: reauditoria focada, checkpoint documental e confirmação de worktree limpo.

### 2026-08-02T03:48Z focused Spec re-audit
- Command: revisão read-only independente do commit `ca5180b`.
- Result: PASS (`RESOLVIDO`).
- Evidence: a revisão confirmou precedência de `%PDF-`/`PK` e teste que entrega somente o PDF interno ao extrator quando `format=PDF` mascara um ZIP.
- Follow-up: checkpoint documental e confirmação de worktree limpo.
