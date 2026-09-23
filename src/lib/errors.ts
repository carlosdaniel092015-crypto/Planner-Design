import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'SOLICITUD_INVALIDA', message, details);
export const unauthorized = (message = 'Inicia sesión para continuar.') => new AppError(401, 'NO_AUTENTICADO', message);
export const forbidden = (message = 'No tienes permiso para realizar esta acción.') => new AppError(403, 'SIN_PERMISO', message);
export const notFound = (what = 'El recurso') => new AppError(404, 'NO_ENCONTRADO', `${what} no existe.`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const gone = (code: string, message: string) => new AppError(410, code, message);
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details);

export const errorBody = (code: string, message: string, details?: unknown) => ({
  error: details === undefined ? { code, message } : { code, message, details },
});
