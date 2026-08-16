// TODO: Replace with a structured logger (pino or winston) for production
// TODO: Add log levels configurable via LOG_LEVEL env var
// TODO: Add correlation IDs for tracing scraper runs

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * `message`, `stack` e `cause` de um `Error` não são enumeráveis, então
 * `JSON.stringify` os descarta e sobra só o que a biblioteca anexou como
 * propriedade própria — um `PrismaClientInitializationError` vira
 * `{"name":...,"clientVersion":...}` e esconde a causa real da falha.
 */
export function serializeMeta(meta: unknown): unknown {
  if (meta instanceof Error) {
    return {
      ...meta,
      name: meta.name,
      message: meta.message,
      ...(meta.cause == null ? {} : { cause: serializeMeta(meta.cause) }),
      ...(meta.stack == null ? {} : { stack: meta.stack }),
    }
  }
  if (Array.isArray(meta)) return meta.map(serializeMeta)
  return meta
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(serializeMeta(meta))}` : ''
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`

  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
}
