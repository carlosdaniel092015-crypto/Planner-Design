# CLAUDE.md — Planner-Design API

Backend del planeador 3D de cocinas y closets. Hono + Drizzle + PostgreSQL 16, desplegado con Docker en Easypanel.

## Comandos

| Tarea | Comando |
|---|---|
| Servidor local (recarga en caliente) | `npm run dev` |
| Frontend (Vite, proxy de /api a :3000) | `npm run dev:web` |
| Tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Pruebas (PGlite, sin Postgres externo) | `npm test` |
| Build (bundle a `dist/`) | `npm run build` |
| Generar migración tras cambiar `src/db/schema.ts` | `npm run db:generate` |
| Aplicar migraciones | `npm run db:migrate` |
| Semilla | `npm run db:seed` |
| Copiar el núcleo desde el frontend | `npm run sync-core` |

Antes de dar algo por terminado: `npm run typecheck && npm run lint && npm test && npm run build`.

## Convenciones

- **Idioma**: identificadores y comentarios en inglés. Mensajes de error de la API, correos y README en español (México).
  Los valores de enums de dominio van en español tal como están en la especificación (`borrador`, `disenador`, …).
- **Errores**: lanzar `AppError` (`src/lib/errors.ts`) con `code` en MAYÚSCULAS_CON_GUIONES y `message` en español.
  La respuesta siempre es `{ error: { code, message, details? } }`.
  - 400 cuerpo mal formado · 401 sin sesión · 403 sin permiso · 404 no existe **o es de otra organización**
  - 402 el plan de la organización no incluye la función o llegó a su límite (`PLAN_REQUERIDO`, `src/lib/plans.ts`)
  - 409 conflicto de versión o de estado · 410 enlace caducado/revocado/usado · 413 demasiado grande
  - 422 regla de negocio (proyecto con errores, archivo no válido) · 429 límite de peticiones
- **Multi-tenant**: toda consulta filtra por `organization_id` tomado de la sesión (`c.var.auth.org.id`), nunca del cliente.
  Un recurso de otra organización responde 404, no 403.
- **Permisos**: toda ruta protegida llama `requirePermission(c, action, resource?)` (`src/lib/permissions.ts`).
  **Proyectos privados:** solo los ve su dueño o a quien se los compartieron (`project_shares`, acceso `ver`/`editar`), admin incluido.
  Cargar siempre con `getProject` (trae `access`) y pasar `{ access }` a los `assertCan('project:…')`; sin `access` se niega.
  Añadir una acción nueva = añadirla a la matriz y a `tests/permissions.test.ts`.
- **Auditoría**: crear/actualizar/eliminar/enviar/aprobar/precios/roles → `audit(...)` dentro de la misma transacción.
- **Dinero**: `numeric` en la BD, `number` redondeado a 2 decimales en la API (`src/lib/money.ts`).
  Los importes de proyectos aprobados salen de `project_versions.pricing_snapshot`, nunca de los precios vigentes.
- **Rutas**: una por recurso en `src/routes/`, definidas con `createRoute` de `@hono/zod-openapi` para que aparezcan en `/docs`.
  Lógica que no sea HTTP va en `src/services/`.
- **Dependencias inyectadas**: `createApp({ db, storage, mailer, config })`. Las pruebas usan PGlite, almacenamiento en memoria y
  correo capturado; no importar singletons globales dentro de rutas.
- **src/core** es el núcleo compartido con el frontend, portado del prototipo de Claude Design (planner-engine.js + validate/corte del HTML).
  Debe ser idéntico en ambos repos (`npm run sync-core`, `-- --check`). Lint lo excluye. Cambios de lógica de dominio van ahí, no en services.
- **Migraciones**: nunca editar una migración ya comprometida; generar una nueva con `npm run db:generate`.

## Mapa

- `src/app.ts` monta la app · `src/server.ts` servidor (Easypanel y local) · `src/deps.ts` arma dependencias desde el entorno
- `src/db/` esquema, cliente (Neon / pg / PGlite), semilla, migrador
- `src/lib/` errores, permisos, dinero, paginación, auditoría, límite de peticiones, OpenAPI
- `src/services/` proyectos, precios, aprobaciones, archivos, biblioteca, correo, almacenamiento, exportaciones
- `frontend/` React + Vite; importa el núcleo con `@core` (la misma copia que el servidor). Es PWA: `frontend/sw.js` (el build inyecta
  la lista de precarga) y `frontend/src/offline/` (IndexedDB por usuario + cola de sincronización). Las páginas leen y guardan proyectos
  por `offline/sync.ts`, nunca directo con `api.saveProject`. `public/` trae el sistema de diseño, three.js
  y el visor 3D del prototipo; `public/prototipo/` es el prototipo original
- `tests/` integración por recurso (`tests/helpers.ts` arma app + BD PGlite migrada)

## Flujo de trabajo

- Los cambios van por pull request hacia `main`. **Autorización permanente del dueño:** en cuanto el PR pase las comprobaciones
  de CI (`.github/workflows/ci.yml`), fusionarlo a `main` sin volver a preguntar (merge commit). Si CI falla, corregir y reintentar;
  nunca fusionar en rojo.
- **Versiones de la app (semver)**: cada PR que cambie la app sube `version` en `package.json` y añade su entrada en `CHANGELOG.md`
  (en español, lo ve el usuario en "Novedades"): parche 1.0.x correcciones · menor 1.x.0 funciones · mayor x.0.0 cambios incompatibles.
  El frontend la muestra (`__APP_VERSION__`) y el servidor la expone en `GET /api/v1/version`.

## Despliegue

Docker (`Dockerfile`) en Easypanel: Postgres como servicio, volumen en `/data` (archivos), `RUN_MIGRATIONS=true` aplica migraciones al arrancar. Detalle en README → "Despliegue en Easypanel".
