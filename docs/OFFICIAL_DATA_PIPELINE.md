# Pipeline oficial de dados — Raio-X 2026

Este documento é o runbook de ingestão, ativação e rollback. Os passos de
staging/produção são procedimentos manuais: não foram executados durante a
implementação.

## Arquitetura e precedência

1. O TSE é canônico para candidaturas e estados eleitorais.
2. Câmara e Senado são canônicos para pessoas, mandatos, projetos e votações.
3. Documentos oficiais são a fonte de programas/propostas de campanha.
4. Sites e imprensa enriquecem contexto. Eles não criam candidaturas, não
   alteram campos oficiais e toda proposta extraída por IA nasce `DRAFT`,
   `AI_EXTRACTION` e `isPublished=false`.

`Person` representa identidade, `Candidate` continua sendo a candidatura e a
fachada compatível da API, e `Mandate` representa exercício legislativo. IDs e
slugs legados permanecem. Projetos legislativos ficam em `LegislativeBill`;
propostas de campanha permanecem em `Proposal`.

O banco não armazena CPF nem título eleitoral. Os parsers removem essas colunas
antes de criar payloads ou itens de revisão.

## Visibilidade pública e rollback de leitura

`CANDIDATE_READ_MODEL` aceita:

- `legacy` (padrão): identidade exibida pelos campos legados de `Candidate`;
- `normalized`: identidade exibida por `Person`, mantendo o mesmo `Candidate.id`,
  slug, URL e shape da API.

Nos dois modos, a API só retorna `isPublished=true` nos cargos
`PRESIDENTE`, `GOVERNADOR` e `SENADOR`. Deputados, suplentes e demais cargos
ficam armazenados e ocultos. Lista, busca, detalhe, estatísticas, propostas,
comparação, transparência, sitemap e caches respeitam essa política.

Campos novos da API são opcionais: `isOfficial`, `officialStatus`, `dataSource`
e `lastSyncedAt`.

## Preparação local

O Compose publica PostgreSQL 16 na porta `5433`.

~~~powershell
docker compose up -d postgres
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5433/raiox2026_test?schema=public'
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @raiox/api exec prisma migrate deploy
pnpm test:unit
pnpm test:integration
pnpm typecheck
pnpm build
~~~

O seed não roda mais no start de produção. Para bootstrap de desenvolvimento,
execute explicitamente:

~~~powershell
pnpm --filter @raiox/api run db:seed
~~~

## Comandos de ingestão

~~~powershell
# Candidaturas canônicas (somente DataSyncRun é gravado em dry-run)
pnpm --filter @raiox/scraper run sync:tse -- --dry-run
pnpm --filter @raiox/scraper run sync:tse

# Complementares, bens, coligações, vagas, cassações e redes
pnpm --filter @raiox/scraper run sync:tse:supplemental -- --dry-run
pnpm --filter @raiox/scraper run sync:tse:supplemental

# Programas/documentos oficiais
pnpm --filter @raiox/scraper run sync:documents -- --dry-run
pnpm --filter @raiox/scraper run sync:documents

# Legislativo — execute contra banco de staging para ensaio
pnpm --filter @raiox/scraper run sync:camara
pnpm --filter @raiox/scraper run sync:senado

# Expand-and-migrate e fila de revisão
pnpm --filter @raiox/scraper run backfill:persons
pnpm --filter @raiox/scraper run review:report
~~~

Reprocessamento é idempotente. Snapshots vazios ou incompletos não removem nem
despublicam pré-candidaturas editoriais. Um PDF repetido não é extraído de novo;
PDF sem texto vira `NEEDS_OCR`; ausência de PDF termina como `NOOP`.

## Agenda UTC

| Fonte | Agenda | Workflow |
|---|---:|---|
| Câmara e Senado | diariamente 03:00 | `sync-legislative.yml` |
| TSE candidaturas + complementares | diariamente 07:00 | `sync-tse.yml` |
| Documentos oficiais | diariamente 08:00 | `sync-documents.yml` |
| Sites de candidatos | segunda-feira 04:00 | `sync-sites.yml` |
| Notícias/contexto | quarta-feira 04:00 | `sync-news.yml` |

Cada fonte tem job independente. Erro persiste `DataSyncRun=FAILED` antes de o
comando terminar com código diferente de zero. A instalação do workspace e o
`prisma generate` são únicos, sem cópia manual de `.prisma/client`.

## Revisão

O relatório CLI lista apenas itens `OPEN`, agrupados por tipo, sem despejar
payloads potencialmente grandes:

~~~powershell
pnpm --filter @raiox/scraper run review:report > review-items.json
~~~

Match automático de candidatura exige nome, cargo, partido e UF inequívocos.
Ambiguidade ou conflito cria `ReviewItem` e mantém o registro oficial oculto.
A resolução inicial é operacional/SQL controlada; painel administrativo está
fora do escopo.

## Rollout manual

1. Fazer backup e obter uma cópia recente do banco para staging.
2. Pausar os novos schedules enquanto a expansão é aplicada.
3. Implantar o código com `CANDIDATE_READ_MODEL=legacy`.
4. Rodar `prisma migrate deploy`. As migrations são aditivas; não removem
   colunas/tabelas legadas.
5. Rodar `backfill:persons` duas vezes e confirmar que a segunda é idempotente.
6. Rodar os três dry-runs TSE/documentos. Registrar contagens e checksums.
7. Em staging, rodar TSE, complementares, Câmara e Senado sem `--dry-run`.
8. Inspecionar `DataSyncRun`, `ReviewItem`, contagens por cargo e amostras de
   IDs/slugs. Confirmar que deputados não aparecem na API.
9. Ativar `CANDIDATE_READ_MODEL=normalized` somente em staging e executar smoke
   tests de lista, busca, detalhe, comparação, transparência e sitemap.
10. Em produção, repetir migrations/backfill/sync com o read model ainda
    `legacy`; então habilitar os schedules.
11. Observar sete sincronizações diárias consecutivas bem-sucedidas antes de
    sequer planejar remoção de campos legados.
12. Após a janela e nova aprovação, alternar o read model de produção para
    `normalized` e reiniciar a API para limpar os caches de candidatos.

Consultas úteis:

~~~sql
SELECT source, kind, status, "startedAt", "finishedAt", metrics, error
FROM "DataSyncRun"
ORDER BY "startedAt" DESC
LIMIT 50;

SELECT kind, count(*)
FROM "ReviewItem"
WHERE status = 'OPEN'
GROUP BY kind;

SELECT position, "isPublished", count(*)
FROM "Candidate"
WHERE "electionYear" = 2026
GROUP BY position, "isPublished"
ORDER BY position, "isPublished";

SELECT "extractionStatus", count(*)
FROM "SourceDocument"
GROUP BY "extractionStatus";
~~~

## Rollback

1. Definir `CANDIDATE_READ_MODEL=legacy` e reiniciar a API.
2. Pausar os cinco workflows de sincronização se a causa for ingestão.
3. Reverter o código para o checkpoint anterior, se necessário.
4. Não dropar tabelas/colunas novas: o legado continua íntegro e as migrations
   de expansão são deliberadamente forward-only.
5. Se houve escrita incorreta, restaurar o backup ou corrigir apenas os registros
   identificados por `syncRunId`; nunca usar um snapshot vazio como sinal de
   exclusão.

## Limites atuais

- OCR, publicação de deputados e novo painel de revisão estão fora do escopo.
- O catálogo TSE observado em 2 de agosto de 2026 tinha 3.465 candidaturas, sem
  presidente/vice-presidente, e 25.493 linhas nos seis recursos suplementares.
- Não havia recurso de programa de governo no catálogo naquele momento; o job
  diário permanece habilitado para detectar sua disponibilização.
