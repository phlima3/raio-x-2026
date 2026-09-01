-- Termina o backfill que `20260831090000_cite_candidacy_page_for_status` começou:
-- lá o `candidacyStatusSourceUrl` foi reescrito nas 20.520 linhas, mas o
-- `runningMateSourceUrl` continuou apontando para o ZIP do catálogo nas 13
-- chapas presidenciais.
--
-- Não foi engano de condição — o UPDATE não chegou a existir quando aquela
-- migration rodou. `scripts/sync-local.sh` executa `prisma migrate deploy` como
-- primeiro passo, e a automação diária das 10:30 alcançou o arquivo no working
-- tree enquanto ele ainda tinha só os dois UPDATEs de status. O nome ficou
-- gravado em `_prisma_migrations`, então o deploy seguinte pulou a migration
-- inteira e o terceiro UPDATE, acrescentado depois, nunca rodou em produção.
--
-- Daí a correção vir aqui, e não como edição daquele arquivo: migration
-- aplicada não se reescreve. Quem criar um banco do zero roda os dois arquivos,
-- e este simplesmente não encontra linha nenhuma para reescrever.
--
-- A página citada é a do próprio presidente, que é onde o DivulgaCandContas
-- publica "Vices / Suplentes" — o vínculo afirmado. O vice não vira `Candidate`
-- e o `SQ_CANDIDATO` dele não fica guardado, então a página do vice não seria
-- montável a partir do banco.
--
-- Idempotente: depois de rodar, o `LIKE 'https://cdn.tse.jus.br/%'` não
-- encontra mais nada.
BEGIN;

UPDATE "Candidate"
SET "runningMateSourceUrl" =
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/'
      || "tseId" || '/' || "electionYear" || '/BR'
WHERE "position"::text = 'PRESIDENTE'
  AND "electionYear" = 2026
  AND "tseId" ~ '^[0-9]+$'
  AND "runningMateName" IS NOT NULL
  AND lower(COALESCE("runningMateSourceUrl", '')) LIKE 'https://cdn.tse.jus.br/%';

COMMIT;
