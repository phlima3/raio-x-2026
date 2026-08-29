-- Composição da receita, limite de gastos e estado da prestação, vindos da
-- consulta de prestador do DivulgaCandContas.
-- Todas as colunas nascem nulas de propósito: ausência de dado tem de continuar
-- distinguível de zero arrecadado.
BEGIN;

ALTER TABLE "CampaignFinancing"
  ADD COLUMN IF NOT EXISTS "fefcReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "partyFundReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "crowdfundingReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "individualsReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "companiesReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "ownResourcesReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "otherReceived" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "spendingLimit" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "totalContracted" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "accountsUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryControlNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "suppliers" JSONB;

COMMIT;
