# Relatório final — pipeline oficial Raio-X 2026

Status: CONCLUÍDO — PIPELINES CANÔNICOS VERDES; BLOQUEIO EXTERNO NO ENRIQUECIMENTO

Run: `20260802T013343Z`
Branch: `phlima3/official-data-pipeline-2026`
Base: `4383a0c4463372e5e484d677efde926a95941303`
Encerramento técnico inicial: 2026-08-02T03:47:32Z
Encerramento operacional: 2026-08-03T16:15:25Z

## Resultado

O pipeline passou a ser official-first sem remover o modelo legado:

- TSE/CKAN é canônico para candidaturas e datasets eleitorais;
- Câmara e Senado gravam `Person`, `Mandate`, `LegislativeBill` e votos, sem
  criar candidaturas;
- documentos oficiais viram `SourceDocument` por SHA-256, com texto ou
  `NEEDS_OCR`;
- sites, imprensa e Gemini apenas enriquecem registros existentes; propostas
  extraídas por IA ficam `DRAFT` e ocultas até revisão;
- `Candidate` continua sendo a fachada compatível, com IDs/slugs/URLs estáveis
  e rollback por `CANDIDATE_READ_MODEL=legacy|normalized`;
- somente presidente, governador e senador publicados aparecem em qualquer
  superfície pública; os outros dez cargos TSE ficam armazenados e ocultos.

A implementação inicial respeitou a proibição de mutações externas. No
follow-up de 3 de agosto, o usuário autorizou explicitamente push para `main`,
sincronização Veloz/GitHub e reexecução dos jobs. Foram usados apenas deploys
automáticos e jobs idempotentes já colocados em escopo; não houve PR, merge,
SQL manual, seed, exclusão de dados ou alteração destrutiva em produção.

## Commits da entrega

| Commit | Entrega |
|---|---|
| `4904bd8` | auditoria do repositório, falha Prisma e estado overnight |
| `959bd68` | testes, schema/migrations, observabilidade, TSE e fachada base |
| `a260252` | Câmara/Senado normalizados, paginação e compatibilidade |
| `f76e95f` | datasets suplementares, PDFs e política de propostas IA |
| `ee483ef` | CI, schedules, filtros públicos, operação e runbook |
| `477582a` | correções do review: migração legada, lifecycle IA, cargos e segurança |
| `ca5180b` | detecção por assinatura de ZIPs TSE rotulados como PDF |
| `58896fa` | túnel autenticado da Veloz nos workflows de banco |
| `1df4e64` | sincronização legislativa diária incremental e conflito de voto seguro |
| `5a1a976` | TSE suplementar em lotes, jobs separados e lease de runs |
| `d963e8f` | navegação resiliente em sites cujo DOM não conclui |
| `49d9a56` | correções do review: sessão incompleta, Person e backfill Câmara |
| `fcc013f` | single-flight do Chromium, corpo comprometido e TLS de site público |
| `1ad997d` | resumos de projetos Câmara e persistência/autorias em lote |
| `f32503d` | retry idempotente de deputado após desconexão transitória |

## Mudanças entregues

### Banco e compatibilidade

- 14 migrations forward-only; nenhuma tabela/coluna legada é removida.
- Novos modelos: `Person`, `Mandate`, `LegislativeBill`,
  `LegislativeBillAuthor`, `SourceDocument`, `DataSyncRun`, `ReviewItem` e
  `OfficialDatasetRecord`.
- `Candidate`, `Proposal` e `VotingRecord` foram expandidos; IDs e slugs
  existentes são preservados.
- Backfill de pessoas é idempotente. Homônimos não inequívocos ficam separados
  e geram revisão.
- A primeira resolução de mandato também liga votos legados a Person/Mandate e
  copia projetos `camara`/`senado` para `LegislativeBill`, mantendo os vínculos
  antigos para rollback.

### TSE

- Descoberta CKAN, download, SHA-256, ZIP/CSV, UTF-8/Latin-1, `;`, aspas,
  marcadores nulos, UF inválida e colunas futuras.
- CPF e título eleitoral são removidos por padrão de nome de coluna antes de
  raw payloads, linhas rejeitadas, metadados ou revisão.
- Treze cargos são armazenáveis, inclusive `VICE_PREFEITO`; publicação
  automática continua limitada à allowlist e ao status oficial elegível.
- Reprocessamento é idempotente. Match exato nome/cargo/partido/UF preserva
  ID/slug; ambiguidade cria candidatura oficial oculta + `ReviewItem`.
- Snapshot vazio/incompleto nunca remove nem despublica registro editorial.
- Complementares, bens, coligações, vagas, cassações e redes ficam em snapshots
  sanitizados; materializadores atualizam somente campos determinísticos.

### Legislativo

- Câmara segue todas as páginas `rel=next` e Senado suporta array oficial,
  links/cabeçalho de próxima página e proteção contra loop.
- Identificadores oficiais têm precedência; match por campos funciona nos dois
  sentidos independentemente de Senado/TSE rodar primeiro.
- Uma falha de qualquer parlamentar falha a fonte, persiste
  `DataSyncRun=FAILED` e retorna código não zero.
- Câmara consulta sessões/votos uma vez por run, com lookback diário de sete
  dias; uma sessão ainda indisponível após retries falha a fonte. Backfill
  explícito usa `--year`, `--from` e `--to`.
- Projetos Câmara do ano corrente usam a listagem oficial paginada por deputado
  e persistência em lote. O caminho diário não repete uma chamada de detalhe
  para cada projeto e preserva status mais rico já armazenado.
- Senado usa a mesma janela diária e mantém `--from/--to` para backfill; matérias
  e votos são persistidos sequencialmente por parlamentar para respeitar o pool.
- `populate:senado` delega ao sync normalizado e não faz fuzzy-link em
  `Candidate`.

### Documentos e IA

- PDF direto ou ZIP é identificado primeiro pela assinatura binária e
  deduplicado por hash, inclusive quando o TSE rotula um ZIP como `PDF`.
  Ausência é `NOOP`; sem texto é `NEEDS_OCR`; parser corrompido falha a fonte.
- O adapter acompanha recursos CKAN cuja fonte declarada pelo TSE é
  CAND/Candex/DivulgaCand; o padrão PDF por UF de eleições anteriores já é
  suportado quando aparecer em 2026.
- Propostas editoriais continuam publicadas. Extrações de site, imprensa ou
  Gemini nascem ocultas e não sobrescrevem uma proposta com `reviewedAt`.
- Erros de persistência de propostas deixam de ser engolidos e falham o job.

### API, frontend e cache

- Lista, busca, detalhe, ID, stats, propostas, comparação, transparência,
  consistência, sitemap e caches aplicam a mesma política pública.
- Modo normalizado lê nome/identidade e votos via Person/Mandate, mantendo
  `Candidate.id`, slug e shape legado.
- Novos campos públicos são somente os opcionais `isOfficial`,
  `officialStatus`, `dataSource` e `lastSyncedAt`; IDs de sync, personId, raw
  oficial e URL interna de fonte não vazam na fachada.
- Startup invalida caches de candidatos, propostas e comparação para impedir
  dados antigos após rollout/read-model switch.

### CI e operação

- Action de setup instala uma vez no workspace e executa `pnpm db:generate` no
  layout `.pnpm` correto; não há cópia de `.prisma/client` por pacote.
- CI usa PostgreSQL 16, aplica migrations e roda unitários, integração,
  typecheck e build.
- Workflows separados: Legislativo 03:00 UTC, TSE 07:00, documentos 08:00,
  sites segunda 04:00 e notícias quarta 04:00.
- O workflow TSE separa candidatura canônica (90 min) do complemento dependente
  (120 min); materializadores e arquivo suplementar usam lotes idempotentes.
- Runs da mesma fonte/tipo abandonados há mais de seis horas são encerrados
  como `FAILED` pelo próximo início, sem tocar execução recente.
- Seed foi removido do `start` da API e do pre-start Veloz; o comando explícito
  de desenvolvimento permanece.
- `review:report` gera JSON read-only de itens abertos sem payloads grandes.

## Evidência de validação

Banco limpo: PostgreSQL 16, database local
`raiox2026_fresh_20260802_test`, porta Compose 5433.

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | PASS; lockfile aceito |
| `pnpm db:generate` | PASS; client no `.pnpm` raiz |
| `prisma format`, `validate`, `migrate deploy/status` | PASS; 14/14 migrations |
| `pnpm test:unit` | PASS; 11 arquivos, 20 testes |
| `pnpm test:integration` | PASS; 11 arquivos, 34 testes PostgreSQL |
| `pnpm typecheck` | PASS; API, scraper e web |
| `pnpm build` | PASS; API, scraper e Next (7 páginas) |
| YAML lint nos workflows/action | PASS |
| `git diff --check` | PASS |
| `review:report` | PASS; JSON válido |

Todos os 11 arquivos de integração abortam antes de limpar dados se o nome do
banco em `DATABASE_URL` não contiver `_test`.

`pnpm lint` foi executado, mas o baseline do repositório não é configurado: a
API declara um comando sem dependência/config ESLint e o Next abre setup
interativo. Isso não bloqueou os typechecks nem o lint/check do `next build` e
fica como dívida separada, não mascarada como PASS.

### Dry-runs oficiais

- TSE candidaturas: 7 recursos descobertos, 3.600 registros, 0 rejeitados na
  revalidação real de produção.
- TSE suplementar: 6 recursos, 26.762 linhas e 6 documentos no run real.
- Documentos 2026: `NOOP`, pois ainda não há recurso PDF no catálogo.
- O snapshot observado não tinha presidente/vice-presidente; nenhuma suposição
  ou despublicação foi feita por essa ausência.

Fontes revalidadas:

- https://dadosabertos.tse.jus.br/dataset/candidatos-2026
- https://dadosabertos.tse.jus.br/dataset/candidatos-2024
- https://dadosabertos.camara.leg.br/howtouse/2017-05-16-js-resultados-paginados.html
- https://legis.senado.leg.br/dadosabertos/api-docs/swagger-ui/index.html

## Review final

Eixo Standards: 0 violações objetivas e 0 julgamentos.

Eixo Spec encontrou sete pontos antes do fechamento:

1. migração legislativa incompleta — resolvido para votos e projetos;
2. erro de site podia terminar como sucesso — resolvido;
3. reprocessamento sobrescrevia revisão IA — resolvido e testado;
4. documentos DivulgaCand — disponibilidade externa documentada; adapter CKAN
   oficial suporta PDF/ZIP e detecta pela assinatura, mesmo com formato
   incorreto no catálogo;
5. `VICE_PREFEITO` ausente — resolvido com migration/teste;
6. campos internos vazavam na fachada — resolvido com teste de contrato;
7. relatório final ausente — resolvido por este documento.

A reauditoria encontrou depois o padrão real de 2024 em que `Formato PDF`
aponta para `application/zip`. O teste reproduziu a falha, a ordem de detecção
foi corrigida em `ca5180b` e a ladder completa passou novamente. A verificação
independente focada classificou o achado como `RESOLVIDO`.

O review do follow-up contra `58896fa` encontrou zero violações objetivas no
eixo Standards. No eixo Spec, apontou sessão da Câmara silenciosamente parcial,
voto legado conflitante sem `personId`, ausência de CLI de backfill e runbook
desatualizado. Todos foram reproduzidos/corrigidos antes do push; a ladder
pós-review passou com 18 unitários e 32 integrações.

## Follow-up operacional de 3 de agosto

- O workflow TSE
  [30822547813](https://github.com/phlima3/raio-x-2026/actions/runs/30822547813)
  ficou integralmente verde. Candidaturas concluíram em 38m51s com 3.600
  parseadas, 106 criadas, 3.494 atualizadas, 0 rejeitadas/revisões/publicações
  e 3.600 ocultas; complementares concluíram em 15m34s com 6 recursos, 26.762
  linhas e 6 `SourceDocument`.
- `49d9a56` foi publicado em `main`; a CI
  [30822401095](https://github.com/phlima3/raio-x-2026/actions/runs/30822401095)
  passou. API `dep_stdSK16Z5qRv` e web `dep_Dz0niDhT5Ksj` ficaram `LIVE` na
  Veloz; health confirmou API, PostgreSQL e Redis `ok`, e a home respondeu 200.
- Senado no run
  [30822550867](https://github.com/phlima3/raio-x-2026/actions/runs/30822550867)
  concluiu em 1m21s: 81 parlamentares, 17 projetos, 0 votos na janela e 0
  falhas; o run anterior abandonado foi fechado como `FAILED` pelo lease.
- O primeiro rerun de sites eliminou os timeouts de Planalto/Bahia, mas revelou
  corpo ainda não anexado no Paraná e dois launches concorrentes. `fcc013f`
  corrigiu ambos; CI
  [30824161154](https://github.com/phlima3/raio-x-2026/actions/runs/30824161154)
  passou.
- No segundo rerun de sites
  [30824196391](https://github.com/phlima3/raio-x-2026/actions/runs/30824196391),
  14/15 fontes e 144 propostas DRAFT passaram. Somente
  `aldorebelo.com.br` ficou inacessível ao runner após duas tentativas; fora do
  runner, o domínio entrega uma página estacionada de venda, sem conteúdo de
  campanha. A falha permaneceu explícita/não zero.
- O run Câmara anterior revelou mais um gargalo: apesar da janela incremental,
  detalhes HTTP e upserts individuais de projetos permitiram apenas 70 dos 512
  mandatos em 71 minutos. O teste reproduziu a chamada N+1, `1ad997d` trocou-a
  por resumos paginados/persistência em lote e a CI
  [30828161319](https://github.com/phlima3/raio-x-2026/actions/runs/30828161319)
  passou. API `dep_r5F3kGzfouv8` e web `dep_AqT3r81c0g_m` ficaram `LIVE`.
- Esse primeiro run otimizado percorreu 511/512 mandatos em 16m50s, mas uma
  conexão PostgreSQL foi fechada durante um `person.findUnique`; a fonte
  terminou corretamente em `FAILED`. O caso foi reproduzido, `f32503d` passou
  a repetir o deputado idempotente até três vezes e mantém falha não zero após
  esgotamento. A CI
  [30829858572](https://github.com/phlima3/raio-x-2026/actions/runs/30829858572)
  passou com 20 unitários e 34 integrações.
- O rerun final
  [30829864895](https://github.com/phlima3/raio-x-2026/actions/runs/30829864895)
  terminou integralmente verde. Câmara concluiu 512/512 parlamentares, 0
  falhas, 24.564 projetos/autorias processados e 0 votos na janela em 16m32s;
  Senado concluiu 81/81, 24 projetos, 0 votos e 0 falhas em 1m26s.
- O snapshot final contém 4.089 pessoas, 512 mandatos Câmara, 81 mandatos
  Senado, 17.961 projetos Câmara, 4.317 projetos Senado e 0 `ReviewItem` aberto.
  A fachada pública continuou com 62 perfis: 8 presidente, 7 governador e 47
  senador. API/DB/Redis ficaram `ok`, home respondeu 200 e os sete workflows
  permaneceram ativos.
- O deploy de `f32503d` ficou `LIVE` como API `dep__SnKDxEU7Xb5` e web
  `dep_friqbB_Dn89I`, substituindo os deploys intermediários sem alterar URLs.

## Pendências, limites e riscos

- PDFs/programas 2026 ainda não foram publicados como recursos; manter o job
  diário e conferir contagem/hash quando aparecerem.
- OCR, publicação de deputados, painel admin e redesign de busca estão fora do
  escopo, conforme solicitado.
- A ativação normalizada depende de revisão dos `ReviewItem` e de amostras
  reais; ambiguidades deliberadamente não são auto-resolvidas.
- APIs oficiais podem alterar envelopes/paginação. Monitorar `DataSyncRun`,
  erros, contagens e duração por fonte.
- Node local foi 22.12.0; CI permanece fixada em Node 20.
- Não remover colunas legadas antes de sete sincronizações diárias consecutivas
  bem-sucedidas e nova aprovação.
- Configurar ESLint é uma tarefa separada; não há falso resultado verde neste
  relatório.
- O enriquecimento semanal continuará vermelho enquanto a única URL configurada
  para Aldo Rebelo for um domínio estacionado e inacessível ao runner; o
  schedule permanece ativo e não há substituição oficial verificada para usar.
- Duas linhas antigas `RUNNING`, deixadas por cancelamentos de Câmara/TSE, serão
  fechadas automaticamente pelo lease no próximo run da mesma fonte após seis
  horas; não houve SQL manual para maquiar o histórico.

## Rollout manual recomendado

1. Fazer backup/cópia recente para staging e pausar os cinco schedules.
2. Implantar com `CANDIDATE_READ_MODEL=legacy`.
3. Rodar `prisma migrate deploy` e `backfill:persons` duas vezes.
4. Rodar os três dry-runs e comparar contagens/checksums.
5. Rodar TSE, suplementar, Câmara e Senado em staging.
6. Verificar `DataSyncRun`, `ReviewItem`, contagens por cargo e amostras de
   IDs/slugs; executar `review:report`.
7. Confirmar que deputados e registros ocultos não aparecem em lista, busca,
   stats, comparação, transparência ou sitemap.
8. Ativar `normalized` somente em staging e repetir smoke tests.
9. Em produção, repetir com read model legado e habilitar schedules; observar
   sete execuções diárias antes de considerar a troca.
10. Após aprovação, ativar `normalized` e reiniciar a API para limpar caches.

## Rollback manual

1. Definir `CANDIDATE_READ_MODEL=legacy` e reiniciar a API.
2. Pausar os cinco workflows se a causa for ingestão.
3. Reverter o código ao checkpoint anterior, sem dropar modelos/colunas novos.
4. Corrigir registros pelo `syncRunId` ou restaurar backup; nunca interpretar
   snapshot vazio como instrução de exclusão.

O procedimento detalhado e as consultas de monitoramento estão em
`docs/OFFICIAL_DATA_PIPELINE.md`.
