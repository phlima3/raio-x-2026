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

## 2026-08-02 — Ordem de implementação ajustada
- Após instalar Vitest/Supertest e concluir o parser TSE básico, antecipar a expansão aditiva do schema antes de finalizar jobs/workflows.
- Motivo: `DataSyncRun`, `Person` e `Mandate` são dependências reais dos comportamentos de falha, ingestão e integração; manter a ordem antiga exigiria adapters descartáveis.

## 2026-08-02 — Snapshot oficial TSE revalidado
- O catálogo CKAN oficial expõe sete recursos de 2026: candidaturas, complementares, bens, coligações, vagas, cassações e redes sociais; não há programa de governo disponível neste momento.
- O `consulta_cand_2026_BRASIL.csv` contém 3.465 linhas, zero presidente/vice-presidente e todos os cargos legislativos observados; `consulta_cand_2026_BR.csv` está vazio.
- A seleção de arquivo prioriza explicitamente `BRASIL.csv`; um teste foi adicionado após o snapshot real revelar a colisão com o arquivo vazio `BR.csv`.
- CPF e título eleitoral são descartados antes de formar dados brutos/revisões; não são persistidos.

## 2026-08-02 — Publicação e reconciliação
- Match automático exige igualdade normalizada de nome, cargo, partido e UF; zero ou múltiplos matches nunca alteram uma candidatura editorial por aproximação.
- Snapshot vazio/incompleto somente cria/atualiza o que está presente; não remove nem despublica registros editoriais.
- A API pública aplica simultaneamente `isPublished` e allowlist presidente/governador/senador, inclusive no modo `legacy`; o modo seleciona a origem da identidade, não relaxa visibilidade.

## 2026-08-02 — Banco local de integração
- O `docker-compose.yml` publica PostgreSQL 16 em `localhost:5433`; documentação e CI local devem usar essa porta, enquanto o serviço CI interno usa 5432.

## 2026-08-02 — Contratos legislativos do Senado
- Usar os endpoints atuais `/processo?codigoParlamentarAutor=...` e `/votacao?codigoParlamentar=...`; os endpoints antigos de autoria/votações estão marcados deprecated no OpenAPI oficial.
- Datas dos filtros modernos usam ISO `YYYY-MM-DD`; entradas legadas `YYYYMMDD` são normalizadas para preservar compatibilidade de chamadas existentes.
- A resposta oficial atual é um array completo; o collector também segue `links[rel=next]` e cabeçalho HTTP `Link` para não truncar instalações paginadas.
- Legislatura e datas vêm de `/senador/{codigo}/mandatos`; nenhum parlamentar atual é reconciliado a Candidate por nome.
