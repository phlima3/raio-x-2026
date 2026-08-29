-- `NM_COLIGACAO` é coluna de nome no TSE: quem concorre por partido isolado vem
-- como "#NULO". O leitor tabular não nulifica o marcador sem `#` final, porque
-- em `DS_SITUACAO_CANDIDATURA` ele significa "ainda sem julgamento" — então o
-- literal chegou ao banco e a ficha do candidato estampava "Coligação #NULO".
--
-- A origem já foi corrigida em `tseSupplemental.ts`, mas lá o nome nulo faz a
-- linha ser pulada: o valor errado que já está gravado nunca seria reescrito
-- por uma nova sincronização. Daí a limpeza aqui.
--
-- Idempotente: rodar de novo não encontra mais nada para limpar.
BEGIN;

UPDATE "Candidate"
SET "coalitionName" = NULL
WHERE upper(btrim("coalitionName")) IN ('#NULO', '#NULO#', '#NE', '#NE#');

COMMIT;
