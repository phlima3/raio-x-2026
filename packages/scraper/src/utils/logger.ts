// TODO: Replace with a structured logger (pino or winston) for production
// TODO: Add log levels configurable via LOG_LEVEL env var
// TODO: Add correlation IDs for tracing scraper runs

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function log(level: LogLevel, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
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
