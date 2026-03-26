import { Request, Response, NextFunction } from 'express'

// TODO: Extend with custom error classes (AppError, ValidationError, NotFoundError)
// TODO: Integrate with error tracking (Sentry)

export interface AppError extends Error {
  statusCode?: number
  isOperational?: boolean
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500
  const message = err.isOperational ? err.message : 'Erro interno do servidor'

  if (process.env.NODE_ENV !== 'production') {
    console.error('[error]', err)
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

export function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message)
  error.statusCode = statusCode
  error.isOperational = true
  return error
}
