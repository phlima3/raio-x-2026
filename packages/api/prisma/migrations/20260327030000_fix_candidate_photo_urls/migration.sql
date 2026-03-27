-- Migration: replace Wikimedia/external photoUrls with local /images/candidates/ paths
-- Safe to re-run: only updates rows where photoUrl matches the old external patterns

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/lula.jpg'
  WHERE name = 'Luiz Inácio Lula da Silva' AND party = 'PT';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/flavio-bolsonaro.jpg'
  WHERE name = 'Flávio Bolsonaro' AND party = 'PL';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/ronaldo-caiado.jpg'
  WHERE name = 'Ronaldo Caiado';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/romeu-zema.jpg'
  WHERE name = 'Romeu Zema';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/eduardo-leite.jpg'
  WHERE name = 'Eduardo Leite' AND state = 'RS';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/simone-tebet.jpg'
  WHERE name = 'Simone Tebet';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/renan-santos.jpg'
  WHERE name = 'Renan Santos' AND party = 'Missão';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/aldo-rebelo.jpg'
  WHERE name = 'Aldo Rebelo';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/tarcisio-de-freitas.jpg'
  WHERE name = 'Tarcísio de Freitas';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/jeronimo-rodrigues.jpg'
  WHERE name = 'Jerônimo Rodrigues';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/ratinho-junior.jpg'
  WHERE name = 'Ratinho Junior';

UPDATE "Candidate" SET "photoUrl" = '/images/candidates/claudio-castro.jpg'
  WHERE name = 'Cláudio Castro';
