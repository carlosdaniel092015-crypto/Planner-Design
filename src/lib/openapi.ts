import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppEnv } from './context';
import { AppError } from './errors';

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'NO_ENCONTRADO' }),
      message: z.string().openapi({ example: 'El proyecto no existe.' }),
      details: z.unknown().optional(),
    }),
  })
  .openapi('Error');

const err = (description: string) => ({ description, content: { 'application/json': { schema: ErrorSchema } } });

export const errors = {
  400: err('Solicitud mal formada o datos inválidos'),
  401: err('Sin sesión'),
  403: err('Sin permiso'),
  404: err('No existe o pertenece a otra organización'),
  409: err('Conflicto de versión o de estado'),
  410: err('Enlace caducado, revocado o ya usado'),
  413: err('Contenido demasiado grande'),
  422: err('Regla de negocio no cumplida'),
  429: err('Demasiadas solicitudes'),
} as const;

export const pick = <K extends keyof typeof errors>(...codes: K[]) =>
  Object.fromEntries(codes.map((c) => [c, errors[c]])) as Pick<typeof errors, K>;

/** Common error set for authenticated routes. */
export const authErrors = pick(400, 401, 403, 404, 429);

export const json = <T extends z.ZodType>(schema: T, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

export const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});

export const IdParam = z.object({ id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, example: '0b8f5c6e-7d0a-4c1e-9f5b-2a3d4e5f6a7b' }) });

export const CurrencyQuery = z.object({
  currency: z.enum(['USD', 'DOP']).optional().openapi({ description: 'Convierte los importes a esta moneda.' }),
});

export function router() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new AppError(
          400,
          'VALIDACION',
          'Los datos enviados no son válidos.',
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
    },
  });
}

export const security: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/**
 * Zod fills `.default()` values for keys the client left out, which in a PATCH would silently reset them
 * (e.g. renaming a texture would also reset its uses and tile size). Keep only the keys actually sent.
 */
// biome-ignore lint/suspicious/noExplicitAny: works with any route context
export async function sentOnly<T extends Record<string, unknown>>(c: any, parsed: T): Promise<Partial<T>> {
  const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => k in raw)) as Partial<T>;
}
