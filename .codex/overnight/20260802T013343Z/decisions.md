# Decisions

## 2026-08-02 — Worktree e checkpoints
- Permanecer na branch dedicada `phlima3/official-data-pipeline-2026`; não criar outro worktree dentro deste worktree.
- Fazer commits locais pequenos após fases estáveis; nunca push/merge/deploy.

## 2026-08-02 — Test seams
- Tratar ingestão por fonte como módulo profundo: interface pequena de execução, adapters remotos injetáveis e persistência injetável.
- Mockar apenas HTTP/arquivos remotos; usar PostgreSQL 16 real para integração quando disponível.
- Escrever fatias verticais RED→GREEN por comportamento observável, não testes de funções privadas.

## 2026-08-02 — Compatibilidade e migração
- `Candidate` continua sendo a fachada de candidatura legada e mantém IDs/slugs; novos modelos são aditivos.
- O caminho `legacy` será o padrão inicial para rollback seguro; `normalized` é ativado explicitamente.
- Campos legados permanecem mesmo quando relações normalizadas passam a ser preenchidas.

## 2026-08-02 — Evidência CI/Prisma
- Os 12 runs agendados listados em 2026-07-22..2026-08-01 falharam.
- O run 30687041481 gerou Prisma em `node_modules/.pnpm/@prisma+client...` e imediatamente falhou porque o workflow buscou `packages/api/node_modules`.
- Correção escolhida: uma instalação de workspace e geração única consumida naturalmente por ambos os pacotes; eliminar cópia de artefato gerado.

## 2026-08-02 — Política official-first
- Parlamentares atuais serão `Person` + `Mandate`; nunca candidaturas implícitas de 2026.
- Campos determinísticos oficiais podem publicar apenas cargos habilitados; dados extraídos por IA começam `DRAFT` e ocultos.
- Ausência/incompletude de snapshot não autoriza delete ou unpublish editorial.
