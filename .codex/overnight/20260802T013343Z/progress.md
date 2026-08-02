# Progress

## Current status
- Phase: Final review and handoff
- State: active
- Last completed action: review em dois eixos concluído; achados materiais corrigidos e ladder final passou com 14 migrations, 13 unitários e 25 integrações.
- Next action: criar checkpoint de review, finalizar relatório/estado persistente e verificar worktree limpo.
- Last known good commit: ee483ef
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
- 2026-08-02T02:37Z — PDF digital e vazio validados com pdfjs-dist; SourceDocument deduplica por hash e classifica NEEDS_OCR sem falhar.
- 2026-08-02T02:40Z — Extrações IA de sites/notícias/Gemini passam a DRAFT oculto; migration de dados preserva propostas editoriais.
- 2026-08-02T02:44Z — Datasets complementares ganham arquivo imutável e OfficialDatasetRecord sanitizado; integração idempotente materializa status, bens, coligação e rede social.
- 2026-08-02T02:45Z — Dry-run oficial suplementar contou 6 recursos/25.493 registros; documentos retornaram NOOP porque o catálogo atual não contém PDFs.
- 2026-08-02T02:53Z — Suite intermediária completa: 7 arquivos/13 unitários e 10 arquivos/19 integrações PostgreSQL passaram.
- 2026-08-02T03:10Z — Reconciliação identidade ficou bidirecional: Legislativo reutiliza Person TSE inequívoca e TSE reutiliza Person/Mandate inequívoca; homônimos nunca são mesclados e geram ReviewItem.
- 2026-08-02T03:12Z — Workflows separados nas agendas pedidas, action única de instalação/generate, seed removido de ambos os pre-starts e relatório CLI de revisão concluídos.
- 2026-08-02T03:16Z — Treze migrations aplicadas do zero em `raiox2026_fresh_20260802_test` no PostgreSQL 16; status atualizado.
- 2026-08-02T03:17Z — Ladder completa passou: 13 unitários, 23 integrações, typecheck dos três pacotes e builds API/scraper/web.
- 2026-08-02T03:18Z — Todos os YAMLs e `git diff --check` passaram; `review:report` executou. Lint legado não é executável por ausência preexistente de ESLint/config na API/web.
- 2026-08-02T03:23Z — Skill `review` executou eixos Standards/Spec em paralelo: Standards sem achados; Spec identificou migração legislativa, propagação de erro, lifecycle IA, cargos e campos internos, além da disponibilidade documental/final report.
- 2026-08-02T03:35Z — Votos/projetos legados agora migram ao mandato sem perder relações legadas; falha de persistência de site propaga; proposta revisada não é sobrescrita; `VICE_PREFEITO` completa cargos TSE; resposta pública omite campos internos.
- 2026-08-02T03:38Z — Catálogo oficial 2026 segue sem recurso PDF; catálogo TSE 2024 confirma PDFs por UF no mesmo CKAN e fonte CAND/Candex/DivulgaCand, compatível com o adapter implementado.
- 2026-08-02T03:40Z — Ladder pós-review passou: 7 arquivos/13 unitários, 11 arquivos/25 integrações, typecheck e builds dos três pacotes; YAML/diff/review CLI verdes.
