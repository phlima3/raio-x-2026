# Progress

## Current status
- Phase: Legislative ingestion, documents and CI completion
- State: active
- Last completed action: Câmara e Senado normalizados, paginados e observados; suite conjunta com 11 testes unitários e 15 de integração verde.
- Next action: implementar SourceDocument/PDF, estado NEEDS_OCR, no-op sem documentos e política DRAFT para extrações IA.
- Last known good commit: 959bd68c84f1ffec219735f2144c29c5c44bc38a
- Working tree status: dirty com implementação do run; nenhuma mudança preexistente do usuário foi encontrada.

## Timeline
- 2026-08-02T01:33:43Z — Criado run `20260802T013343Z` via `bootstrap_run.py`.
- 2026-08-02T01:36Z — Lidos integralmente README, CLAUDE e documentos indicados; não existe `AGENTS.md` local.
- 2026-08-02T01:42Z — Mapeados três pacotes, Prisma, migrations, jobs, workflows, API, busca, comparação, sitemap e frontend.
- 2026-08-02T01:47Z — Confirmadas 12 falhas agendadas consecutivas; run 30687041481 falha ao procurar `packages/api/node_modules` após generate em `node_modules/.pnpm`.
- 2026-08-02T01:50Z — Plano ajustado às evidências: jobs legislativos hoje criam candidatos, paginação é parcial, TSE é TODO e seed roda no pre-start.
- 2026-08-02T01:54Z — `pnpm install --frozen-lockfile`, generate, typechecks e build passaram; não havia testes no repositório.
- 2026-08-02T01:58Z — Primeiro tracer bullet falhou por módulo ausente e passou após implementar parser CSV.
- 2026-08-02T02:01Z — Parser ampliado para Latin-1/nulos/UF/colunas novas; ZIP ganhou erro tipado; 5/5 testes passam.
- 2026-08-02T02:07Z — Schema Prisma e migration SQL aditivos criados e aplicados em PostgreSQL 16; nenhuma tabela ou coluna legada é removida.
- 2026-08-02T02:10Z — Backfill idempotente, runner `DataSyncRun` e persistência Person/Mandate passaram em integração real.
- 2026-08-02T02:13Z — Cliente CKAN, importador/reconciliador TSE e política de publicação passaram; dry-run oficial contou 3.465 registros e zero rejeições.
- 2026-08-02T02:16Z — Fachada `legacy|normalized` e filtros públicos passaram via Supertest mantendo IDs/slugs.
- 2026-08-02T02:18Z — Câmara passou a paginar `rel=next`, persistir mandatos/votos/projetos normalizados e falhar o job se qualquer parlamentar falhar.
- 2026-08-02T02:21Z — Suite conjunta estabilizada: 5 arquivos/8 testes unitários e 6 arquivos/12 testes PostgreSQL passaram; conexão reproduzível usa porta 5433 do compose.
- 2026-08-02T02:30Z — Senado migrou para `/processo` e `/votacao`, mandato oficial e persistência normalizada; `populate:senado` não faz mais fuzzy-link em Candidate.
- 2026-08-02T02:32Z — Câmara recebeu runner injetável observado e lifecycle seguro de Prisma; falha remota persiste FAILED e propaga exit não zero.
- 2026-08-02T02:33Z — Suite completa intermediária: 6 arquivos/11 unitários e 8 arquivos/15 integrações PostgreSQL passaram.
