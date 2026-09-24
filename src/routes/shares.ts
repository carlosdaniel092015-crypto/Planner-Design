import { createRoute, z } from '@hono/zod-openapi';
import { authErrors, body, IdParam, json, pick, router, security } from '../lib/openapi';
import { requireAuth } from '../services/auth';
import { listShares, removeShare, setShare } from '../services/shares';
import { RoleSchema } from './auth';

const tags = ['Compartir'];
const Access = z.enum(['ver', 'editar']).openapi('AccesoCompartido');
const Share = z
  .object({ userId: z.uuid(), name: z.string(), email: z.email(), role: RoleSchema, access: Access, createdAt: z.iso.datetime() })
  .openapi('Compartido');
const Params = z.object({ id: z.uuid(), userId: z.uuid() });

export function shareRoutes() {
  const r = router();

  r.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/shares',
      tags,
      summary: 'Con quién está compartido el proyecto',
      description: 'Lo ve cualquiera con acceso al proyecto. Los proyectos son privados: solo los ve su dueño y las personas de esta lista.',
      security,
      request: { params: IdParam },
      responses: {
        200: json(
          z.object({
            owner: z.object({ userId: z.uuid(), name: z.string(), email: z.email(), role: RoleSchema }).nullable(),
            myAccess: z.enum(['propietario', 'editar', 'ver']),
            items: z.array(Share),
          }),
        ),
        ...authErrors,
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      return c.json(await listShares(c.var.deps.db, a, c.req.valid('param').id), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'put',
      path: '/{id}/shares/{userId}',
      tags,
      summary: 'Compartir el proyecto con alguien (o cambiar su acceso)',
      description:
        'Solo el dueño. `ver`: abre el proyecto y descarga planos y lista de corte. `editar`: además lo modifica y lo envía a aprobación (solo roles admin y diseñador). ' +
        'Quien recibe el proyecto ve el mismo proyecto (no una copia), con los cambios del dueño.',
      security,
      request: { params: Params, ...body(z.object({ access: Access }).openapi({ example: { access: 'ver' } })) },
      responses: { 200: json(Share), ...authErrors, ...pick(422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id, userId } = c.req.valid('param');
      const { access } = c.req.valid('json');
      return c.json(await c.var.deps.db.transaction((tx) => setShare(tx, a, id, userId, access)), 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}/shares/{userId}',
      tags,
      summary: 'Dejar de compartir',
      description: 'El dueño quita el acceso a alguien; quien recibió el proyecto puede quitárselo a sí mismo.',
      security,
      request: { params: Params },
      responses: { 204: { description: 'Sin contenido' }, ...authErrors },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { id, userId } = c.req.valid('param');
      await c.var.deps.db.transaction((tx) => removeShare(tx, a, id, userId));
      return c.body(null, 204);
    },
  );

  return r;
}
