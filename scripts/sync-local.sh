#!/usr/bin/env bash
#
# Execução local dos syncs de dados, no lugar do GitHub Actions.
#
# Os workflows agendados foram desligados em 2026-08-29 (só sobrou
# `workflow_dispatch`). Este script é o que passou a rodar no lugar deles,
# disparado pelas automations do Orca.
#
# Por que local: o billing do GitHub travou e nenhum job rodava desde 17/08.
# Por que browser: o TSE responde 403 a cliente automatizado — curl, fetch do
# Node e Chromium headless levam 403; o Chrome instalado, em modo headed,
# passa. Daí `TSE_BROWSER_TRANSPORT=1`.
#
# DOIS LOTES, porque o custo é muito diferente:
#
#   diário   — o que muda durante a campanha: prestação de contas, anexos,
#              votações. Poucos minutos.
#   semanal  — o cadastro de candidaturas (20.436 registros em 29 CSVs) e os
#              documentos. Passa de 15 minutos pelo browser, e encerrado o
#              prazo de registro só muda quando sai julgamento — que se move
#              em semanas, não em horas.
#
# EXIGE:
#   - DATABASE_URL apontando para o banco (o .env da raiz já vem da Veloz)
#   - sessão gráfica aberta (o Chrome abre visível; tela bloqueada tudo bem,
#     máquina suspensa não)
#
# USO:
#   ./scripts/sync-local.sh              # lote diário
#   ./scripts/sync-local.sh --weekly     # lote semanal
#   ./scripts/sync-local.sh --all        # os dois, para uso manual
#   qualquer um aceita --dry-run

set -uo pipefail
cd "$(dirname "$0")/.."

DRY=""
LOTE="diario"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="-- --dry-run" ;;
    --weekly)  LOTE="semanal" ;;
    --all)     LOTE="tudo" ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

# Carrega o .env da raiz e exporta tudo, para os subprocessos herdarem. O
# `dotenv/config` de cada pacote procura o arquivo no diretório dele, não aqui
# — e no Windows o symlink que o CLAUDE.md descreve nem sempre é criável.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não está definida. Sem ela nada é gravado." >&2
  echo "Reexporte com: veloz env export .env --service api --project prj_rZISk51AmKMn" >&2
  echo "e troque o host pelo do túnel (127.0.0.1:15432)." >&2
  exit 1
fi

export TSE_BROWSER_TRANSPORT=1

# O banco da Veloz só é alcançável por túnel: o host publicado
# (shared-br-se1-a-rw.veloz-db) resolve dentro do cluster, não aqui. O .env
# aponta para 127.0.0.1:15432, que é onde este túnel escuta.
TUNEL_PID=""
if ! (echo > /dev/tcp/127.0.0.1/15432) 2>/dev/null; then
  echo "abrindo túnel para o Postgres da Veloz…"
  veloz db tunnel raiox-postgres --project prj_rZISk51AmKMn --port 15432 >/dev/null 2>&1 &
  TUNEL_PID=$!
  for _ in $(seq 1 15); do
    (echo > /dev/tcp/127.0.0.1/15432) 2>/dev/null && break
    sleep 2
  done
  if ! (echo > /dev/tcp/127.0.0.1/15432) 2>/dev/null; then
    echo "ERRO: o túnel não subiu em 30s. Sem ele nada alcança o banco." >&2
    exit 1
  fi
fi
# Fecha o túnel ao sair, inclusive se o script for interrompido.
trap '[ -n "$TUNEL_PID" ] && kill "$TUNEL_PID" 2>/dev/null' EXIT

FALHAS=()

# Roda um passo e segue mesmo se falhar: um sync quebrado não pode impedir os
# outros de atualizarem. O resumo no fim é que decide o código de saída.
passo() {
  local nome="$1"; shift
  echo ""
  echo "──────── $nome  ($(date '+%H:%M:%S'))"
  if "$@"; then
    echo "✓ $nome"
  else
    echo "✗ $nome (código $?)"
    FALHAS+=("$nome")
  fi
}

echo "Sync local [$LOTE] — $(date '+%Y-%m-%d %H:%M') ${DRY:+(dry-run)}"

# Barata e idempotente; vale nos dois lotes, porque o sync grava em colunas
# que a migration cria.
passo "migrations" pnpm --filter @raiox/api exec prisma migrate deploy

if [ "$LOTE" = "diario" ] || [ "$LOTE" = "tudo" ]; then
  # O que se move durante a campanha. Não depende do lote semanal ter rodado
  # hoje: `tseId` e `ballotNumber` já estão no banco desde a importação.
  passo "tse:financiamento" pnpm --filter @raiox/scraper run sync:financiamento $DRY
  passo "tse:anexos"        pnpm --filter @raiox/scraper run sync:divulgacand $DRY
  # Câmara e Senado são outro host e nunca foram bloqueados — não precisam do
  # browser, mas rodam no mesmo lote por conveniência.
  passo "camara" pnpm --filter @raiox/scraper run sync:camara
  passo "senado" pnpm --filter @raiox/scraper run sync:senado
fi

if [ "$LOTE" = "semanal" ] || [ "$LOTE" = "tudo" ]; then
  # A candidatura canônica primeiro: o resto depende de `tseId` e
  # `ballotNumber` já estarem no banco.
  passo "tse:candidaturas" pnpm --filter @raiox/scraper run sync:tse $DRY
  passo "tse:complementar" pnpm --filter @raiox/scraper run sync:tse:supplemental $DRY
  passo "documentos"       pnpm --filter @raiox/scraper run sync:documents $DRY
  passo "sites"            pnpm --filter @raiox/scraper run process:proposals
  passo "noticias"         pnpm --filter @raiox/scraper run news:weekly
fi

echo ""
echo "════════ resumo [$LOTE] — $(date '+%H:%M:%S')"
if [ ${#FALHAS[@]} -eq 0 ]; then
  echo "todos os passos concluídos"
  exit 0
fi
echo "falharam: ${FALHAS[*]}"
exit 1
