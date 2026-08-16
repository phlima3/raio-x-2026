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

O importador aceita o conjunto completo de cargos eleitorais do TSE, inclusive
os cargos municipais (`PREFEITO`, `VICE_PREFEITO` e `VEREADOR`). A allowlist
pública continua restrita aos três cargos definidos para o lançamento.

Os ZIPs do TSE não têm layout único: dependendo do pleito trazem um CSV
nacional consolidado, um CSV por UF, um `_BR` só com a chapa presidencial, ou
uma combinação. Todos os CSVs do recurso são lidos — candidaturas concatenadas
e deduplicadas por `SQ_CANDIDATO`, recursos suplementares processados arquivo a
arquivo para limitar o pico de memória. As métricas `archiveFiles`,
`archiveFileNames` e `duplicates` do `DataSyncRun` mostram o que foi lido.

O vínculo entre a candidatura oficial e a pré-candidatura editorial compara
nome civil e nome de urna dos dois lados, normaliza a sigla partidária
(`União Brasil` ≡ `UNIÃO`) e ignora a UF nos cargos de circunscrição nacional,
onde o TSE grava `SG_UF = 'BR'` e o catálogo editorial guarda a UF de origem.

O banco não armazena CPF nem título eleitoral. Os parsers removem essas colunas
antes de criar payloads ou itens de revisão.

## Visibilidade pública e rollback de leitura

`CANDIDATE_READ_MODEL` aceita:

- `legacy` (padrão): identidade exibida pelos campos legados de `Candidate`;
- `normalized`: identidade exibida por `Person`, mantendo o mesmo `Candidate.id`,
  slug, URL e shape da API.

Nos dois modos, a API só retorna `isPublished=true` nos cargos
`PRESIDENTE`, `GOVERNADOR` e `SENADOR`. Deputados, suplentes e demais cargos
ficam armazenados e ocultos.

A publicação exige `officialStatus` em `ELIGIBLE` ou `PENDING`. Nos dias
seguintes ao prazo de registro a quase totalidade das candidaturas ainda está
pendente de julgamento; exigir `ELIGIBLE` deixaria o site vazio até o TSE
julgar os registros. `INELIGIBLE`, `CANCELLED` e `UNKNOWN` continuam ocultos.
O parser lê `DS_SITUACAO_CANDIDATURA` e `DS_DETALHE_SITUACAO_CAND` — o detalhe
tem precedência nos estados negativos (indeferimento, cassação, renúncia) — e
grava os dois em `officialStatusRaw` no formato `SITUAÇÃO / DETALHE`. Lista, busca, detalhe, estatísticas, propostas,
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

# Backfill histórico explícito (o caminho diário usa lookback móvel de 7 dias)
2023..2026 | ForEach-Object {
  pnpm --filter @raiox/scraper run sync:camara -- --year=$_
}
pnpm --filter @raiox/scraper run sync:senado -- --from=2023-01-01 --to=2026-12-31

# Janela customizada da Câmara; --year seleciona o ano dos projetos
pnpm --filter @raiox/scraper run sync:camara -- --from=2024-01-15 --to=2024-06-30 --year=2024

# Expand-and-migrate e fila de revisão
pnpm --filter @raiox/scraper run backfill:persons
pnpm --filter @raiox/scraper run review:report
~~~

Reprocessamento é idempotente. Snapshots vazios ou incompletos não removem nem
despublicam pré-candidaturas editoriais. Um PDF repetido não é extraído de novo;
PDF sem texto vira `NEEDS_OCR`; ausência de PDF termina como `NOOP`.
O catálogo CKAN informa como fonte CAND/Candex/DivulgaCand e o coletor aceita
recursos PDF diretos ou ZIP, seguindo o padrão publicado pelo TSE em eleições
anteriores. Enquanto os PDFs de 2026 não aparecem como recursos, o job não
tenta adivinhar IDs de um endpoint DivulgaCand não documentado.

## Agenda UTC

| Fonte | Agenda | Workflow |
|---|---:|---|
| Câmara e Senado | diariamente 03:00 | `sync-legislative.yml` |
| TSE candidaturas + complementares | ao atualizar `main` e a cada 2h, no minuto 15 | `sync-tse.yml` |
| Documentos oficiais | diariamente 08:00 | `sync-documents.yml` |
| Sites de candidatos | segunda-feira 04:00 | `sync-sites.yml` |
| Notícias/contexto | quarta-feira 04:00 | `sync-news.yml` |

Cada fonte tem job independente. Erro persiste `DataSyncRun=FAILED` antes de o
comando terminar com código diferente de zero. A instalação do workspace e o
`prisma generate` são únicos, sem cópia manual de `.prisma/client`.

No caminho diário, Câmara e Senado consultam uma janela móvel inclusiva de sete
dias para absorver correções tardias sem repetir todo o histórico. A Câmara lê
cada sessão/voto compartilhado uma vez por run; qualquer página/sessão que siga
indisponível após retries falha a fonte, em vez de produzir sucesso parcial.
Projetos do ano corrente são lidos pela listagem paginada por parlamentar e
persistidos em lote, sem uma chamada HTTP de detalhe por projeto. O resumo
oficial é atualizado e um status mais rico já armazenado é preservado.
Cada parlamentar é uma unidade idempotente e recebe até três tentativas para
desconexões transitórias; esgotar as tentativas ainda falha a fonte inteira.
Backfills exigem as flags explícitas mostradas acima.

No workflow TSE, cada execução começa sincronizando o snapshot canônico de candidaturas;
isso ocorre após uma atualização da `main` e também no cron de duas horas. `candidacies`
aplica migrations pendentes pelo Prisma, sob o lock do próprio migrador, antes de acessar
o novo schema e possui timeout de 90 minutos. O job
`supplemental` inicia somente após seu sucesso, abre túnel próprio e possui 120
minutos. Persistência complementar ocorre em lotes idempotentes. Ao iniciar um
run, uma execução anterior da mesma fonte/tipo que permaneça `RUNNING` por mais
de seis horas é encerrada como `FAILED`; runs recentes não são alterados.

### Acesso do GitHub Actions ao PostgreSQL da Veloz

O PostgreSQL da Veloz usa endereço privado. Antes de executar qualquer job de
dados, os workflows abrem um túnel autenticado para `127.0.0.1:15432` por meio
da action local `setup-veloz-db-tunnel`.

Configure estes secrets no repositório:

- `VELOZ_API_KEY`: chave não interativa autorizada a abrir o túnel no projeto;
- `PROD_DATABASE_URL`: URL do banco com host `127.0.0.1` e porta `15432`, usando
  as credenciais atuais do serviço PostgreSQL.

Ao rotacionar usuário ou senha do banco, atualize `PROD_DATABASE_URL`. Ao
revogar a chave de automação, substitua `VELOZ_API_KEY`. O job interrompe com
código não zero se a chave estiver ausente, se o processo do túnel terminar ou
se a porta local não ficar disponível em 90 segundos.

> **O host da URL é do túnel, não da Veloz.** O painel da Veloz entrega a URL
> com o endereço interno do serviço (`...@shared-br-se1-a-rw.veloz-db:5432/...`).
> O runner do GitHub não resolve esse nome: ele só enxerga a ponta local do
> túnel. Copie usuário, senha e nome do banco, mas troque host e porta por
> `127.0.0.1:15432`. Manter o host interno é o erro mais comum ao renovar o
> secret, e a falha resultante não é óbvia — o passo do túnel passa, e o job
> quebra depois, na primeira escrita.

#### Falha conhecida: sync TSE parado entre 11 e 16 de agosto de 2026

Cinco execuções agendadas consecutivas falharam com
`PrismaClientInitializationError` cerca de 40 segundos após iniciar. O túnel
subia normalmente e o erro ocorria em `runDataSourceSync.ts`, na primeira
escrita de `DataSyncRun` — antes de qualquer acesso ao TSE. A API e o site
seguiam funcionando o tempo todo, porque a Veloz injeta `DATABASE_URL` nos
serviços automaticamente enquanto `PROD_DATABASE_URL` é mantido à mão.

Essa assimetria é o sinal a procurar: **produção no ar e job de dados
quebrado ao mesmo tempo apontam para o secret, não para o banco.** Confirme
abrindo o site antes de investigar a infraestrutura.

O diagnóstico levou dias porque o log da falha trazia apenas
`{"name":"PrismaClientInitializationError","clientVersion":"5.22.0"}`.
`message`, `stack` e `cause` não são enumeráveis em `Error` e eram descartados
por `JSON.stringify`. O logger do scraper passou a preservá-los; uma falha
equivalente agora registra o motivo (`Can't reach database server at ...`).

### Pendências de segurança

- **Rotacionar a credencial do PostgreSQL de produção.** A URL de conexão foi
  exposta em canal de chat em 16/08/2026. A rotação não é necessária para o
  pipeline funcionar — o secret corrigido opera com a credencial atual — mas
  deve ser feita assim que a ingestão estiver estabilizada. Ao rotacionar,
  atualize `PROD_DATABASE_URL` e confirme que os serviços da Veloz receberam a
  nova credencial.

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
7. Em staging, rodar TSE, complementares, Câmara e Senado sem `--dry-run`. A
   primeira sincronização legislativa vincula votos legados ao mandato e copia
   projetos `camara`/`senado` para `LegislativeBill`, preservando as relações
   legadas para rollback.
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
- O catálogo TSE revalidado em produção em 3 de agosto de 2026 tinha 3.600
  candidaturas, sem presidente/vice-presidente, e 26.762 linhas nos seis
  recursos suplementares.
- Não havia recurso de programa de governo no catálogo naquele momento; o job
  diário permanece habilitado para detectar sua disponibilização.
- Texto oficial extraído fica em `SourceDocument`. Transformá-lo em propostas
  estruturadas exige extração e revisão; qualquer futura saída de IA deve
  seguir `DRAFT` + `isPublished=false` e não sobrescrever item já revisado.
