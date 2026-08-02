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
- [ ] Centralizar instalação/geração Prisma no workspace; remover cópias manuais.
- [ ] Separar workflows/schedules por fonte e garantir exit code não zero.
- [ ] Remover seed automático do pre-start, mantendo comando explícito.
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
- [ ] Aplicar published+office policy a lista, detalhe, stats, busca, comparação, propostas, sitemap e cache.
- [ ] Acrescentar campos oficiais opcionais aos tipos web.
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
- [ ] Rodar unitários, integração PostgreSQL 16, typecheck, lint e builds.
- [ ] Aplicar skill `review` e corrigir achados relevantes.
- [ ] Revisar diff, migrations, contratos, caches, schedules e histórico de commits.
- [ ] Documentar dry-run, ativação, monitoramento, sete syncs, rollout e rollback sem executar.
- [ ] Fechar critérios em `final-report.md` com evidências honestas.
- Deliverable: relatório final e checkpoints locais.
- Validation: ladder completa + inspeção final.
- Dependencies: todas as fases.
- Risk: medium.
- Rollback: instruções exatas no relatório; nenhum push/deploy.
