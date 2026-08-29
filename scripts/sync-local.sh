#!/usr/bin/env bash
#
# Execução local dos syncs de dados, no lugar do GitHub Actions.
#
# Os workflows agendados foram desligados em 2026-08-29 (só sobrou
# `workflow_dispatch`). Este script é o que passou a rodar no lugar deles,
# disparado pela automation do Orca.
#
# Por que local: o billing do GitHub travou e nenhum job rodava desde 17/08.
# Por que browser: o TSE responde 403 a cliente automatizado — curl, fetch do
# Node e Chromium headless levam 403; o Chrome instalado, em modo headed,
# passa. Daí `TSE_BROWSER_TRANSPORT=1`.
#
# EXIGE:
#   - DATABASE_URL apontando para o banco de produção
#   - sessão gráfica aberta (o Chrome abre visível; tela bloqueada tudo bem,
#     máquina suspensa não)
#
# USO:
#   ./scripts/sync-local.sh              # grava
#   ./scripts/sync-local.sh --dry-run    # não grava
#   ./scripts/sync-local.sh --weekly     # inclui os jobs semanais

set -uo pipefail
cd "$(dirname "$0")/.."

DRY=""
WEEKLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="-- --dry-run" ;;
    --weekly)  WEEKLY=1 ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não está definida. Sem ela nada é gravado." >&2
  echo "Defina no .env da raiz ou exporte antes de rodar." >&2
  exit 1
fi

export TSE_BROWSER_TRANSPORT=1

FALHAS=()

# Roda um passo e segue mesmo se falhar: um sync quebrado não pode impedir os
# outros de atualizarem. O resumo no fim é que decide o código de saída.
passo() {
  local nome="$1"; shift
  echo ""
  echo "──────── $nome"
  if "$@"; then
    echo "✓ $nome"
  else
    echo "✗ $nome (código $?)"
    FALHAS+=("$nome")
  fi
}

echo "Sync local — $(date '+%Y-%m-%d %H:%M') ${DRY:+(dry-run)}"

# A migration vem antes de tudo: o sync grava em colunas que ela cria.
passo "migrations" pnpm --filter @raiox/api exec prisma migrate deploy

# Ordem herdada do sync-tse.yml: a candidatura canônica primeiro, porque o
# resto depende de `tseId` e `ballotNumber` já estarem no banco.
passo "tse:candidaturas"  pnpm --filter @raiox/scraper run sync:tse $DRY
passo "tse:complementar"  pnpm --filter @raiox/scraper run sync:tse:supplemental $DRY
passo "tse:financiamento" pnpm --filter @raiox/scraper run sync:financiamento $DRY
passo "tse:anexos"        pnpm --filter @raiox/scraper run sync:divulgacand $DRY

# Câmara e Senado são outro host e nunca foram bloqueados — não precisam do
# browser, mas rodam no mesmo lote por conveniência.
passo "camara" pnpm --filter @raiox/scraper run sync:camara
passo "senado" pnpm --filter @raiox/scraper run sync:senado

if [ "$WEEKLY" -eq 1 ]; then
  passo "documentos" pnpm --filter @raiox/scraper run sync:documents $DRY
  passo "sites"      pnpm --filter @raiox/scraper run process:proposals
  passo "noticias"   pnpm --filter @raiox/scraper run news:weekly
fi

echo ""
echo "════════ resumo"
if [ ${#FALHAS[@]} -eq 0 ]; then
  echo "todos os passos concluídos"
  exit 0
fi
echo "falharam: ${FALHAS[*]}"
exit 1
