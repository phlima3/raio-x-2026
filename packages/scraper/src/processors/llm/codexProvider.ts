import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BaseLLMProvider } from './baseProvider'

const DEFAULT_TIMEOUT_MS = 300_000

/**
 * Janela do Codex medida em caracteres, com folga para o prompt e a resposta.
 *
 * **Documento acima do orçamento é pulado inteiro**, não truncado: o
 * `extract:programs` o conta em `oversized` e segue adiante. Com os 200 mil
 * daqui, 23 dos 165 planos estaduais ficaram de fora sem render nada; a rodada
 * com `CODEX_INPUT_BUDGET=600000` trouxe todos os 23 e mais 2.850 propostas.
 *
 * O maior plano medido tem 523 mil caracteres. O default fica em 200 mil por
 * ser o que roda rápido no caso comum; quando as métricas mostrarem
 * `oversized > 0`, é sinal de rodar de novo com o orçamento maior — e não de
 * que aqueles documentos não tinham proposta.
 */
const DEFAULT_INPUT_BUDGET = 200_000

/**
 * Extração de propostas usando o Codex CLI já instalado e autenticado na
 * máquina, em vez de uma API key.
 *
 * É o que destrava os planos de governo: o Groq responde 401 e corta em 12 mil
 * caracteres, e o Gemini exige `GEMINI_API_KEY`. O Codex não precisa de
 * nenhuma das duas — a sessão do usuário já vale.
 *
 * Cada chamada é uma sessão nova e descartável:
 *
 * - `--ephemeral` não deixa arquivo de sessão para trás;
 * - `-s read-only` impede o agente de escrever no disco. Isto aqui é extração
 *   de texto, não edição de código, e um provider de LLM não tem por que poder
 *   mexer no repositório;
 * - `--ignore-user-config` deixa de fora AGENTS.md, skills e hooks do usuário.
 *   Sem isso um prompt trivial gastava 11,8 mil tokens e 11s contra 4,6s —
 *   e, pior, instrução pessoal do usuário passaria a influenciar o texto
 *   extraído de documento oficial;
 * - `-o <arquivo>` recebe só a resposta final. O stdout traz banner, hooks e
 *   contagem de tokens no meio; parsear aquilo seria adivinhar onde a resposta
 *   começa.
 *
 * Env vars:
 *   LLM_PROVIDER=codex
 *   CODEX_BIN=codex               (default)
 *   CODEX_MODEL=                  (opcional; usa o default do CLI)
 *   CODEX_TIMEOUT_MS=300000       (default)
 *   CODEX_INPUT_BUDGET=200000     (default)
 */
export class CodexProvider extends BaseLLMProvider {
  protected readonly providerName = 'codex'

  private readonly bin: string
  private readonly model: string | undefined
  private readonly timeoutMs: number
  readonly inputBudget: number

  constructor() {
    super()
    this.bin = process.env.CODEX_BIN ?? 'codex'
    this.model = process.env.CODEX_MODEL?.trim() || undefined
    this.timeoutMs = positiveInt(process.env.CODEX_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS
    this.inputBudget = positiveInt(process.env.CODEX_INPUT_BUDGET) ?? DEFAULT_INPUT_BUDGET
  }

  async complete(prompt: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'raiox-codex-'))
    const outputPath = join(dir, 'resposta.txt')
    try {
      await this.run(prompt, outputPath)
      const answer = (await readFile(outputPath, 'utf8')).trim()
      if (!answer) throw new Error('Codex terminou sem resposta final')
      return answer
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private run(prompt: string, outputPath: string): Promise<void> {
    const args = [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '-s', 'read-only',
      '-o', outputPath,
      ...(this.model ? ['-m', this.model] : []),
      // `-` manda o Codex ler o prompt do stdin. Passar um plano de governo
      // como argumento estoura o limite de linha de comando do sistema.
      '-',
    ]

    return new Promise((resolve, reject) => {
      // No Windows o `codex` do npm e um shim `.cmd`, e desde a CVE-2024-27980
      // o Node recusa executar `.cmd` sem shell. Com shell, cada argumento que
      // possa conter espaco precisa vir aspeado -- o caminho do arquivo de
      // saida sai de `tmpdir()`, que em varias maquinas mora sob "Documents and
      // Settings" ou um nome de usuario com espaco.
      const windows = process.platform === 'win32'
      const child = spawn(this.bin, windows ? args.map(quoteArg) : args, {
        stdio: ['pipe', 'ignore', 'pipe'],
        shell: windows,
      })
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Codex passou de ${Math.round(this.timeoutMs / 1000)}s`))
      }, this.timeoutMs)

      child.stderr.on('data', (chunk) => { stderr += String(chunk) })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(new Error(`Não consegui executar "${this.bin}": ${error.message}`))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) return resolve()
        reject(new Error(`Codex saiu com código ${code}: ${stderr.trim().slice(-300)}`))
      })

      child.stdin.end(prompt)
    })
  }
}

/** Aspas so onde fazem falta; aspa dentro do valor e escapada para o cmd.exe. */
export function quoteArg(value: string): string {
  return /[\s&|<>^"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
