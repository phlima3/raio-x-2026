# Execution plan

## Phase 1 — Discovery and baseline
- [x] Auditar instruções, README/CLAUDE/docs, manifests, schema/migrations, jobs, workflows, API e frontend.
- [x] Confirmar estado Git e mudanças preexistentes.
- [x] Revalidar a falha recente de Prisma nos logs agendados.
- [x] Instalar pelo workspace e registrar testes/typecheck/build baseline.
- Deliverable: mapa de contratos, falhas e seams de teste.
- Validation: `git status --short --branch`; `gh run list`; `gh run view 30687041481 --log-failed`; comandos baseline.
- Risk: low.
- Rollback: nenhum código de produto alterado.

## Phase 2 — Test infrastructure and CI/Prisma
- [x] Adicionar Vitest/Supertest e helpers PostgreSQL 16.
- [x] Criar fixtures TSE sintéticas e primeiro tracer bullet RED→GREEN.
- [x] Centralizar instalação/geração Prisma no workspace; remover cópias manuais.
- [x] Separar workflows/schedules por fonte e garantir exit code não zero.
- [x] Remover seed automático do pre-start, mantendo comando explícito.
- Deliverable: CI reproduzível e jobs independentes.
- Validation: testes focados, `pnpm db:generate`, typecheck, validação YAML/build.
- Dependencies: Phase 1.
- Risk: medium.
- Rollback: reverter checkpoint da fase; nenhum dado migrado.

## Phase 3 — Additive normalized schema and observability
- [x] Criar enums/modelos `Person`, `Candidacy`/extensão compatível de `Candidate`, `Mandate`, `LegislativeBill`, `SourceDocument`, `DataSyncRun`, `ReviewItem` e relações de voto.
- [x] Escrever migration SQL aditiva/idempotente, sem drops.
- [x] Implementar runner comum de fontes com métricas e estados de erro.
- [x] Implementar backfill idempotente de pessoas/duplicatas conhecidas.
- Deliverable: modelo expandido coexistindo com legado.
- Validation: `prisma validate`, banco PostgreSQL 16 limpo + migrate deploy, testes de backfill/idempotência.
- Dependencies: Phase 2.
- Risk: high.
- Rollback: manter novas tabelas/colunas sem ativar read model; `legacy` continua padrão.

## Phase 4 — Compatible read facade and public visibility
- [x] Criar módulo profundo de leitura com adapters `legacy` e `normalized` selecionados por env.
- [x] Preservar shape/IDs/slugs; gerar novos slugs `nome-partido-UF-cargo-ano` sem alterar existentes.
- [x] Aplicar published+office policy a lista, detalhe, stats, busca, comparação, propostas, sitemap e cache.
- [x] Acrescentar campos oficiais opcionais aos tipos web.
- Deliverable: contratos públicos compatíveis e rollback por variável.
- Validation: Supertest em ambos os read models, typecheck API/web e testes de URLs/filtros.
- Dependencies: Phase 3.
- Risk: high.
- Rollback: `CANDIDATE_READ_MODEL=legacy`.

## Phase 5 — TSE official ingestion and reconciliation
- [x] Implementar descoberta CKAN/download por interfaces injetáveis.
- [x] Implementar ZIP/CSV, encodings, delimitador/aspas/nulos/colunas extras/UF/cargos.
- [x] Persistir snapshots em batches idempotentes e métricas/erros.
- [x] Reconciliar editorial com match determinístico; ambiguidades viram `ReviewItem`.
- [x] Garantir snapshot vazio/incompleto não destrutivo e política de publicação.
- [x] Preparar importadores complementares (bens, coligações, vagas, cassações, redes) conforme recursos disponíveis.
- Deliverable: ingestão TSE official-first testada por fixtures.
- Validation: matriz de parser, reprocessamento, contagens, reconciliação e falhas.
- Dependencies: Phases 3–4.
- Risk: high.
- Rollback: manter dados oficiais ocultos e usar read model legado.

## Phase 6 — Legislative ingestion and domain separation
- [x] Paginar Câmara integralmente por links/próxima página.
- [x] Paginar/adaptar Senado integralmente conforme contratos oficiais.
- [x] Upsert somente `Person`/`Mandate`; nunca `Candidate` nas duas fontes.
- [x] Persistir votações no mandato/pessoa e projetos em `LegislativeBill`, mantendo fachada compatível.
- Deliverable: histórico legislativo normalizado sem candidaturas artificiais.
- Validation: testes de múltiplas páginas, zero criação de candidaturas, idempotência e respostas compatíveis.
- Dependencies: Phase 3.
- Risk: high.
- Rollback: campos legados permanecem; read model legado não é removido.

## Phase 7 — Official documents and campaign proposals
- [x] Implementar descoberta/download de documentos quando existentes.
- [x] Persistir `SourceDocument` por SHA-256; extrair PDF com `pdfjs-dist`.
- [x] Tratar no-op sem PDFs e `NEEDS_OCR` sem texto.
- [x] Distinguir proposta editorial publicada de extração IA `DRAFT` oculta.
- Deliverable: pipeline documental idempotente e seguro.
- Validation: testes no-PDF/repetido/sem-texto/texto e visibilidade.
- Dependencies: Phases 3–5.
- Risk: medium.
- Rollback: documentos/propostas novas ficam ocultos; legado preservado.

## Phase 8 — Full validation, review and handoff
- [x] Rodar unitários, integração PostgreSQL 16, typecheck, lint e builds (lint sem configuração preexistente, registrado em validation.md).
- [x] Aplicar skill `review` e corrigir achados relevantes.
- [x] Revisar diff, migrations, contratos, caches, schedules e histórico de commits.
- [x] Documentar dry-run, ativação, monitoramento, sete syncs, rollout e rollback sem executar.
- [x] Fechar critérios em `final-report.md` com evidências honestas.
- Deliverable: relatório final e checkpoints locais.
- Validation: ladder completa + inspeção final.
- Dependencies: todas as fases.
- Risk: medium.
- Rollback: instruções exatas no relatório; nenhum push/deploy.

## Phase 9 — Operational follow-up (authorized rollout)
- [x] Corrigir acesso do GitHub Actions ao PostgreSQL privado da Veloz por túnel autenticado.
- [x] Validar CI, documentos oficiais e deploy automático no commit publicado.
- [x] Tornar a execução diária da Câmara incremental em vez de repetir o histórico integral por deputado.
- [x] Separar TSE canônico e complementares em jobs sequenciais com timeouts independentes e persistência suplementar em lotes.
- [x] Diagnosticar e corrigir a falha real do enriquecimento de sites sem ampliar publicação.
- [x] Reexecutar TSE e Legislativo e registrar métricas reais de produção.
- [x] Reexecutar Senado após confirmar a recuperação HTTP 200 do serviço oficial.
- [x] Atualizar validação e relatório final com commits, runs e bloqueios externos.
- [x] Remover o N+1 de projetos Câmara e repetir deputado após desconexão transitória, mantendo falha estrita após retries.
- Deliverable: schedules ativos e execuções verificadas no ambiente real.
- Validation: teste focado RED→GREEN, ladder local, CI e runs manuais das fontes.
- Risk: high (jobs autorizados escrevem apenas por upsert idempotente em produção).
- Rollback: pausar workflows, voltar `CANDIDATE_READ_MODEL=legacy` e reverter o último commit sem remover schema/dados aditivos.
