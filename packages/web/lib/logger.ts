type LogLevel = 'info' | 'warn' | 'error'

function write(level: LogLevel, message: string, metadata?: unknown): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(metadata === undefined ? {} : { metadata }),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const logger = {
  info: (message: string, metadata?: unknown): void => write('info', message, metadata),
  warn: (message: string, metadata?: unknown): void => write('warn', message, metadata),
  error: (message: string, metadata?: unknown): void => write('error', message, metadata),
}
