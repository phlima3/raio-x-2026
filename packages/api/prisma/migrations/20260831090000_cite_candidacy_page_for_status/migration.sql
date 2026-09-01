-- A ficha do candidato citava como "Fonte" o pacote do catálogo
-- (`consulta_cand_complementar_2026.zip`): clicar baixava um ZIP em vez de
-- abrir uma fonte que a pessoa consiga ler e conferir. A origem já foi
-- corrigida em `importCandidates.ts`, que passa a gravar a página pública da
-- candidatura no DivulgaCandContas — mas o valor já gravado só seria reescrito
-- por um `sync:tse` completo, e esse sync baixa um arquivo que não desce
-- dentro do limite do transporte por browser. Daí a correção aqui.
--
-- Reparo pontual, não regra: a regra viva é `candidacyPublicUrl` no scraper.
-- Por isso o `idEleicao` aparece literal — vale para as linhas de 2026 já
-- gravadas, e é a única coisa que esta migration precisa endereçar.
--
-- Só toca no que veio do catálogo. `syncPresidenciaveis` também escreve neste
-- campo, a partir de notícia: trocar aquilo por uma página do TSE atribuiria à
-- Justiça Eleitoral um status que ela não declarou.
--
-- `runningMateSourceUrl` recebe a página do **próprio presidente**, que é onde o
-- DivulgaCandContas publica "Vices / Suplentes" — o vínculo afirmado. Não é só
-- preferência editorial: o vice não vira `Candidate` (não há uma linha sequer
-- com `position = 'VICE_PRESIDENTE'`) e o `SQ_CANDIDATO` dele não está em lugar
-- nenhum do banco, então citar a página do vice seria irreconstruível aqui.
--
-- Idempotente: depois de rodar, o `LIKE 'https://cdn.tse.jus.br/%'` não
-- encontra mais nada para reescrever.
BEGIN;

-- Disputa nacional: o DivulgaCandContas indexa por unidade eleitoral, que é BR.
UPDATE "Candidate"
SET "candidacyStatusSourceUrl" =
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/'
      || "tseId" || '/' || "electionYear" || '/BR'
WHERE "position"::text IN ('PRESIDENTE', 'VICE_PRESIDENTE')
  AND "electionYear" = 2026
  AND "tseId" ~ '^[0-9]+$'
  AND lower(COALESCE("candidacyStatusSourceUrl", '')) LIKE 'https://cdn.tse.jus.br/%';

-- Demais cargos: a unidade eleitoral é a UF, e sem UF válida não há endereço.
UPDATE "Candidate"
SET "candidacyStatusSourceUrl" =
      'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/'
      || upper("state") || '/' || upper("state") || '/20322002026/'
      || "tseId" || '/' || "electionYear" || '/' || upper("state")
WHERE "position"::text NOT IN ('PRESIDENTE', 'VICE_PRESIDENTE')
  AND "electionYear" = 2026
  AND "tseId" ~ '^[0-9]+$'
  AND "state" ~ '^[A-Za-z]{2}$'
  AND lower(COALESCE("candidacyStatusSourceUrl", '')) LIKE 'https://cdn.tse.jus.br/%';

-- Composição da chapa: a página é a da candidatura majoritária, que é a linha
-- que está sendo atualizada. Só quem tem vice registrado tem o que citar.
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
