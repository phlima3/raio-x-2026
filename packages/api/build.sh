#!/bin/bash
set -e

pnpm install --frozen-lockfile
cd packages/api

# O cliente Prisma gerado num build anterior sobrevive no cache de camadas e
# esconde do runtime as colunas novas do schema. Em 2026-08-29 a API serviu a
# forma antiga de `CampaignFinancing` — sem fundão, sem composição da receita —
# mesmo com a migration aplicada, o schema correto no `main` e o `prisma
# generate` reportando sucesso. Apagar antes de gerar é o que garante que o
# cliente do runtime corresponde ao schema deste build.
rm -rf node_modules/.prisma
rm -rf ../../node_modules/.prisma
rm -rf ../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma

npx prisma generate

# Prova no log do build. Sem isto, um cliente velho só aparece como campo
# faltando numa resposta de produção, que é o pior lugar para descobrir.
node -e "
const { Prisma } = require('@prisma/client')
const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'CampaignFinancing')
const campos = model.fields.map((f) => f.name)
console.log('[build] CampaignFinancing:', campos.length, 'campos')
console.log('[build] campos:', campos.join(','))
if (!campos.includes('fefcReceived')) {
  console.error('[build] ERRO: o cliente gerado não tem fefcReceived — cache velho')
  process.exit(1)
}
"
