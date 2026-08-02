# Objective

## Requested outcome
Implementar, validar e documentar neste worktree o pipeline official-first do Raio-X 2026: TSE canônico para candidaturas; Câmara/Senado para pessoas, mandatos, votações e projetos; documentos oficiais para propostas de campanha; scraping e imprensa apenas como enriquecimento. Preservar IDs, slugs, URLs e contratos públicos por uma migração aditiva e uma fachada `CANDIDATE_READ_MODEL=legacy|normalized`.

## Acceptance criteria
- [ ] Vitest/Supertest e PostgreSQL 16 têm comandos reproduzíveis; CI executa testes, typecheck e builds.
- [ ] Prisma é instalado/gerado pelo workspace sem cópia manual frágil; a falha agendada observada deixa de ser reproduzível.
- [ ] Schedules são separados: TSE 07:00 UTC, legislativo 03:00 UTC, documentos 08:00 UTC, sites segunda 04:00 UTC e notícias quarta 04:00 UTC.
- [ ] Toda falha de fonte cria `DataSyncRun` com erro e encerra o comando com código não zero.
- [ ] Migração somente aditiva cria `Person`, candidatura normalizada/metadados oficiais, `Mandate`, `LegislativeBill`, `SourceDocument`, `DataSyncRun` e `ReviewItem`; legado não é apagado.
- [ ] Backfill é idempotente, preserva `Candidate.id` e `Candidate.slug`, e trata duplicatas conhecidas sem merge ambíguo.
- [ ] Fachada selecionável mantém `/api/candidates`, IDs, slugs e URLs e acrescenta apenas campos opcionais (`isOfficial`, `officialStatus`, `dataSource`, `lastSyncedAt`).
- [ ] Listas, stats, busca, comparação, sitemap e cache públicos só consideram candidaturas publicadas nos cargos PRESIDENTE, GOVERNADOR e SENADOR.
- [ ] Parser TSE cobre UTF-8/Latin-1, aspas, `;`, nulos, ZIP, UF inválida, colunas desconhecidas e batches idempotentes.
- [ ] Reconciliação inequívoca preserva ID/slug; ambiguidade cria candidatura oficial oculta e `ReviewItem`; snapshot vazio/incompleto não apaga ou despublica pré-candidatos editoriais.
- [ ] Todos os cargos TSE são armazenados; apenas presidente, governador e senador podem ser publicados inicialmente.
- [ ] Câmara/Senado percorrem todas as páginas, fazem upsert de `Person`/`Mandate` e nunca criam candidaturas.
- [ ] Votações pertencem a mandato/pessoa; projetos legislativos ficam separados das propostas de campanha, mantendo respostas públicas compatíveis.
- [ ] Documento oficial é deduplicado por SHA-256; nenhum PDF é sucesso; repetição é idempotente; PDF sem texto vira `NEEDS_OCR`.
- [ ] Propostas editoriais existentes permanecem publicadas; extração por IA nasce `DRAFT` e invisível até revisão.
- [ ] Seed automático é removido do pre-start de produção e continua disponível como bootstrap explícito de desenvolvimento.
- [ ] Unitários, integração, typecheck e builds relevantes são executados e registrados em `validation.md`.
- [ ] `final-report.md` contém commits, mudanças, testes, pendências, riscos e rollout/rollback manual.

## Non-goals
- Publicar deputados.
- Executar OCR.
- Criar painel administrativo de revisão.
- Redesenhar busca.
- Remover tabelas/colunas legadas antes de sete sincronizações diárias bem-sucedidas.
- Executar rollout, deploy, push, merge, PR ou mutação de produção.

## Safety constraints
- Sem push, merge, deploy, PR, escrita em banco de produção ou mutação de sistemas externos.
- Sem CPF armazenado ou usado como identificador persistente.
- Preservar mudanças do usuário; o worktree começou sem mudanças preexistentes.
- Integrações indisponíveis usam fixtures sintéticas e documentação de execução real posterior.

## Repository context
- Root: `C:\Users\ph\orca\workspaces\raio-x-2026\official-data-pipeline-2026`
- Starting branch: `phlima3/official-data-pipeline-2026`
- Starting commit: `4383a0c4463372e5e484d677efde926a95941303`
- Pre-existing changes: nenhum; `.codex/` foi criado por este run.
- Package manager: pnpm 10.28.2 workspace (há lockfiles antigos por pacote que serão avaliados sem remoção especulativa).
- Runtime local: Node 22.12.0; CI declara Node 20; PostgreSQL 16 via Compose.
