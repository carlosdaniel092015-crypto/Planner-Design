# Planner-Design · Planeador 3D de cocinas y closets

Backend del planeador de muebles (Planner). Guarda proyectos, clientes y versiones. Administra el catálogo de módulos, materiales y precios, y las bibliotecas de texturas y modelos 3D de cada empresa. También almacena renders y PDF, y gestiona el enlace de aprobación que se envía al cliente final.

- **Stack:** Node 20+ · TypeScript strict · Hono · Drizzle ORM · PostgreSQL 16 · zod + OpenAPI · sharp · gltf-transform
- **Despliegue:** Docker en **Easypanel**, con Postgres como servicio y archivos en un volumen.
- **Documentación interactiva:** `GET /api/v1/docs` (Scalar) y `GET /api/v1/openapi.json`

---

## Frontend (`frontend/`)

App en React 19 con Vite. Tiene el diseño del prototipo de Claude Design (sistema Modernist) y su visor 3D (`public/planner-3d.js`, con three.js local en `public/vendor`). Usa **el mismo `src/core`** que el servidor (alias `@core`). Por eso el presupuesto y la validación del editor son idénticos a los del servidor.

**Etapa 1 (lista):**

- **Acceso:** inicio de sesión, recuperación de contraseña e invitación.
- **Inicio:** "Mis proyectos", donde se crean, abren, duplican y eliminan.
- **Editor:**
  - vistas 3D, planta y alzado;
  - biblioteca de módulos, materiales, propiedades, validación y precio;
  - guardado automático en el dispositivo, que se sube solo al servidor (ver "Aplicación instalable y sin conexión");
  - deshacer y rehacer;
  - precios en USD y DOP.

### Planes y pagos

Planes por organización (`src/lib/plans.ts`): **Gratis** (2 usuarios, 5 proyectos activos), **Profesional** (10 usuarios,
proyectos ilimitados, enlace al cliente con firma, logo y color propios, CSV/DXF) y **Empresa** (todo ilimitado, auditoría y
ajuste masivo de precios). Los límites los aplica el servidor (402 `PLAN_REQUERIDO`) **solo si Stripe está configurado**
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PROFESIONAL`, `STRIPE_PRICE_EMPRESA`); sin Stripe todo está incluido.

1. En Stripe crea un producto por plan con un precio mensual y copia sus `price_…`.
2. Crea un webhook a `https://TU-DOMINIO/api/v1/billing/webhook` con `checkout.session.completed` y `customer.subscription.*`, y copia su secreto.
3. Activa el **portal de clientes** en Stripe (cambiar plan, tarjeta, cancelar).
4. En Administración → Plan el administrador paga con Stripe Checkout y administra su suscripción en el portal.

Las organizaciones que ya existían pasan al plan Empresa con la migración, así que no pierden funciones.

### Tiendas de apps

Para publicar en Play Store (Android) y App Store (iPhone) sigue [docs/TIENDAS.md](docs/TIENDAS.md). Android usa
`ANDROID_PACKAGE_NAME` y `ANDROID_CERT_SHA256` para `/.well-known/assetlinks.json`.

### Proyectos privados y compartidos

- **Cada proyecto es privado:** solo lo ve su dueño. Esto vale para todos los roles, incluido el administrador; el taller ve únicamente lo que le compartan.
- **Compartir** (botón de personas en el editor, o "Compartir" en el menú de cada proyecto): el dueño elige a alguien de su organización y el acceso:
  - **Solo ver:** abre el proyecto y descarga planos y lista de corte.
  - **Puede editar:** además lo modifica y lo envía a aprobación. Solo roles admin y diseñador; el taller y lectura solo pueden "ver".
- Quien lo recibe ve **el mismo proyecto** (no una copia), con los cambios del dueño, en la pestaña **"Compartidos conmigo"**.
- **Solo el dueño** elimina el proyecto y cambia o quita accesos; quien lo recibió puede salir de él.
- Un proyecto no compartido responde **404** a los demás, igual que uno de otra organización. Compartir y quitar acceso queda en la auditoría.
- API: `GET/PUT/DELETE /projects/{id}/shares[/{userId}]`, `GET /users/directory` y `GET /projects?scope=todos|mios|compartidos`.

### Aplicación instalable y sin conexión (PWA)

- **Instalable** en celular, tablet y computadora ("Agregar a la pantalla de inicio" / "Instalar app"). El editor se adapta: en pantallas chicas los paneles se abren encima del 3D.
- **Funciona sin internet:** un service worker (`frontend/sw.js`; el build le inyecta la lista de archivos) guarda la app, three.js, los íconos y el visor. Las texturas y modelos se guardan al usarse.
- **Los proyectos viven primero en el dispositivo** (`frontend/src/offline`): IndexedDB con **una base por usuario** y una cola de cambios. Cada cambio se guarda al instante en el dispositivo y se sube cuando hay conexión (al reconectar, cada 30 s y al guardar). Además se deja una copia síncrona del borrador por si el sistema cierra la app antes de terminar de escribir.
- Se pueden **abrir** sin conexión los proyectos ya abiertos en ese dispositivo (la lista descarga en segundo plano los 40 más recientes). También se pueden **crear, duplicar y eliminar**. Un proyecto creado sin conexión recibe su id del servidor al sincronizar (`clientRef` hace que el reintento no lo duplique).
- **Conflictos:** si otra persona guardó mientras tanto, si el proyecto se aprobó o si ya no hay permiso de edición, tu versión no se pierde. Se guarda como un proyecto nuevo "… (copia sin conexión)" y el editor te lo avisa.
- **Sesión:** si no hay conexión, la app abre con el último usuario de ese dispositivo. **Cerrar sesión borra del dispositivo** sus proyectos, la cola y los archivos guardados; si quedan cambios sin subir, pide confirmación. Si se cierra sesión sin conexión, la sesión del servidor se cierra al volver internet.
- **Sin conexión no está disponible:** subir texturas o modelos, enviar a aprobación ni nada que necesite al servidor en el momento.

**Siguientes etapas:** asistente de especificaciones, bibliotecas propias (texturas y GLB), pantalla de aprobación con PDF y enlace al cliente, y lista de corte.

El prototipo original sigue disponible en `/prototipo/`.

**Desarrollo:** `npm run dev` levanta la API en el puerto 3000. `npm run dev:web` levanta Vite en el 5173, con proxy de `/api` hacia la API.

**Producción:** `npm run build` genera `dist/web`, y la API lo sirve en `/`.

## Requisitos

- Node.js 20 o superior (probado con 22 y 24)
- Una de estas opciones de base de datos:
  - Docker, para levantar Postgres 16 en local
  - Un Postgres 16 accesible
  - Nada: `DATABASE_URL=pglite://./.data/pg` usa Postgres embebido, solo para desarrollo

## Variables de entorno

Copia `.env.example` a `.env`. Cada variable está explicada ahí. Las importantes:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres. En Easypanel es la URL interna del servicio. |
| `AUTH_SECRET` | Firma las URLs de subida (≥ 32 caracteres en producción). |
| `API_URL` | URL pública de la API (`https://…` activa la cookie `Secure`). |
| `FRONTEND_URL` | Único origen permitido por CORS y base de los enlaces de correo. |
| `UPLOADS_DIR` | Carpeta de archivos (en Docker: `/data/uploads`, en el volumen). |
| `BLOB_READ_WRITE_TOKEN` | Opcional: guarda los archivos en Vercel Blob en vez del disco. |
| `RESEND_API_KEY`, `MAIL_FROM` | Correo. Sin clave, los correos se imprimen en consola. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Admin inicial que crea `npm run db:seed`. |
| `RUN_MIGRATIONS` | `true` aplica migraciones al arrancar (la imagen Docker lo trae activado). |

Ningún secreto va en el repositorio: `.env` está en `.gitignore`.

## Desarrollo local

```bash
npm install
cp .env.example .env
docker compose up -d db          # Postgres 16 en localhost:5432 (o usa pglite://./.data/pg)
npm run db:migrate
npm run db:seed
npm run dev                      # http://localhost:3000/api/v1/docs
```

Inicia sesión desde `/docs` con `POST /api/v1/auth/sign-in` usando `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente |
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` | Biome |
| `npm test` | Pruebas de integración con PGlite (no necesita Postgres) |
| `npm run build` | Bundle de producción en `dist/` |
| `npm run db:generate` | Genera una migración tras cambiar `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones |
| `npm run db:seed` | Organización de ejemplo, admin y catálogo del prototipo |
| `npm run sync-core` | Copia `src/core` desde el repo del frontend |
| `npm run check` | typecheck + lint + test + build |

## Migraciones y semilla

- Las migraciones viven en `drizzle/` y están versionadas en git. Nunca edites una ya publicada: cambia el esquema y corre `npm run db:generate`.
- `0001_approvals_append_only` agrega un trigger. Con él, `approvals` solo admite inserciones: la base rechaza `UPDATE` y `DELETE`.
- La semilla es idempotente: puedes correrla varias veces. Crea lo siguiente:
  - la organización (tasa inicial 60 RD$/US$, ITBIS 18 %, merma 15 %);
  - el usuario admin;
  - 40 módulos, 14 materiales y 11 herrajes, tomados de `src/core/catalog.ts` y `src/core/materials.ts`, con precios en USD.

  Todo es editable desde la API.

## Pruebas

```bash
npm test
```

Son 60 pruebas de integración en `tests/`. Cada archivo levanta la app con un Postgres embebido (PGlite), migrado desde cero y con dos organizaciones sembradas. El almacenamiento es en memoria y el correo se captura. Cubren los criterios de aceptación:

- aislamiento entre organizaciones (404);
- permisos por rol;
- 409 por versión vieja;
- 410 para enlaces caducados, revocados o usados;
- no aprobar con errores;
- el estimado en USD y DOP coincide con el núcleo;
- los precios de un proyecto aprobado quedan congelados aunque cambie la tasa;
- texturas con miniatura y 2K;
- GLB con su bounding box y materiales, y 422 si no es válido;
- ida y vuelta de la biblioteca en ZIP;
- `/docs`.

## Despliegue en Easypanel

1. **Postgres:** en tu proyecto de Easypanel, *+ Service → Postgres* (versión 16). Copia la *Internal Connection URL*.
2. **App:** *+ Service → App*.
   - **Source:** este repositorio de GitHub (`carlosdaniel092015-crypto/Planner-Design`), rama `main`.
   - **Build:** *Dockerfile* (está en la raíz).
3. **Environment:** configura lo siguiente.
   - `DATABASE_URL`: la URL interna del paso 1.
   - `AUTH_SECRET`: un secreto aleatorio.
   - `API_URL=https://tudominio.com`.
   - `FRONTEND_URL=https://tudominio.com`.
   - `RESEND_API_KEY` y `MAIL_FROM`.
   - `RUN_MIGRATIONS=true` ya viene en la imagen.
4. **Mounts:** agrega un *Volume* montado en `/data`. Ahí se guardan los archivos subidos (`/data/uploads`).
5. **Domains:** agrega tu dominio con puerto **3000**. Hay dos opciones:
   - **Recomendada (mismo dominio):** `tudominio.com` con *Path* `/api` apuntando a esta app, y `/` al frontend. La cookie de sesión queda del mismo sitio y no hace falta CORS.
   - **Subdominio:** `api.tudominio.com`. Entonces `API_URL=https://api.tudominio.com` y `FRONTEND_URL=https://tudominio.com`. La cookie es `SameSite=Lax` y ambos comparten el sitio `tudominio.com`, así que funciona.
6. **Deploy.** Al arrancar, el contenedor aplica las migraciones pendientes. La primera vez, abre la *Console* del servicio y corre la semilla:
   ```bash
   SEED_ADMIN_EMAIL=tu@correo.com SEED_ADMIN_PASSWORD='una-clave-larga' node dist/seed.js
   ```
7. **Verifica** con `https://tudominio.com/api/v1/health`, que debe responder `{"status":"ok","db":"ok"}`, y con `https://tudominio.com/api/v1/docs`.

La imagen incluye `HEALTHCHECK` contra `/api/v1/health`. El proceso cierra con `SIGTERM` de forma ordenada.

### Conexión con el frontend

- El frontend llama a `/api/v1/*` con `credentials: 'include'`.
- **En producción, con el mismo dominio:** basta con el enrutamiento por ruta de Easypanel (`/api` → esta app).
- **En desarrollo con Vite:** agrega un proxy en `vite.config.ts` para que la cookie sea del mismo origen:
  ```ts
  server: { proxy: { '/api': 'http://localhost:3000' } }
  ```
- **Si algún día el frontend queda en Vercel y la API en Easypanel:** agrega este rewrite al `vercel.json` del frontend:
  ```json
  { "rewrites": [{ "source": "/api/:path*", "destination": "https://api.tudominio.com/api/:path*" }] }
  ```

### Subida de archivos desde el navegador

1. `POST /api/v1/files/upload-token` con `{ kind, contentType, size, name, projectId? }`. Devuelve `mode: "local"` y una `uploadUrl` firmada que dura 15 minutos.
2. `PUT uploadUrl` con los bytes y el mismo `Content-Type`.
3. `POST /api/v1/files` con `{ kind, blobUrl, name, projectId? }`. El servidor valida el contenido real y genera las variantes: 256 px y 2K para imágenes.
4. Para texturas y módulos: `POST /api/v1/library/textures` o `/library/modules` con los `fileId`.

**Modelos 3D:** se aceptan GLB/glTF, **SketchUp (.skp)**, **3ds Max (.3ds)** o un **ZIP** con el `.3ds` y sus texturas PNG/JPG (hasta 80 MB). SKP y 3DS se convierten a GLB al registrarlos; el archivo apunta al GLB, el original queda en `variants.original` y `meta` trae `source`, `sourceName` y los avisos (por ejemplo, las unidades deducidas de un .3ds).

Si configuras `BLOB_READ_WRITE_TOKEN`, el paso 1 devuelve `mode: "blob"` y un token. En ese caso, en el paso 2 se usa `put()` de `@vercel/blob/client`.

## Núcleo compartido (`src/core`)

`src/core` es lógica pura, sin dependencias de servidor:

- tipos y esquema zod del proyecto;
- catálogo, plantillas y materiales;
- geometría;
- despiece (`parts`);
- reglas (`validateProject`);
- lista de corte (`corte`, `cutlistCsv`);
- presupuesto (`computeEstimate`);
- dibujos de planta y alzado.

El servidor lo usa para validar el JSON, recalcular el estimado y bloquear la aprobación de proyectos con errores.

- **Origen:** está portado 1:1 del prototipo de Claude Design (`planner-engine.js`: `parts`, `geo`, `zr`, `wallPt`, `plan`, `elev`, y `validate`/`corte`/`exportCsv` del HTML). Conserva los mismos textos de validación y el mismo formato de CSV.
- **Debe ser idéntico en ambos repos.** Cuando el frontend (Vite + React) exista, su `src/core` debe salir de esta carpeta. A partir de ahí, `npm run sync-core -- <ruta-al-frontend>` la copia de vuelta byte por byte, y `npm run sync-core -- --check` falla si difieren (útil en CI).
- **A futuro:** conviene un monorepo con `packages/core` para no mantener dos copias.

## Decisiones tomadas (y por qué)

1. **Easypanel en lugar de Vercel**, a pedido tuyo. Es un servidor Node normal en Docker (`@hono/node-server`). No hay límite de 4.5 MB por petición, así que importar y exportar ZIP y los GLB grandes funcionan directo. Los archivos van a un volumen de disco servido por la propia API, con subida firmada por HMAC. Vercel Blob queda como opción con una variable.
2. **Sesiones propias con argon2id** (`@node-rs/argon2`, parámetros OWASP), en vez de Better Auth. Motivos:
   - Cada usuario pertenece a una organización y tiene un rol.
   - No hay registro público: los usuarios entran por invitación.
   - Los ids son uuid.
   - Better Auth habría exigido plugins y tablas propias para eso.

   La cookie `pd_session` es httpOnly, SameSite=Lax y Secure con https, y en la base solo se guarda el SHA-256 del token. Hay recuperación de contraseña por correo, invitaciones y cierre de sesiones al restablecer la clave. También se acepta `Authorization: Bearer` para scripts. Las rutas viven en `/api/v1/auth/*`: `sign-in`, `sign-out`, `forgot-password`, `reset-password` y `accept-invite`.
3. **El modelo de proyecto es el estado del editor del prototipo:** `ptype`, `room {A,B,H}`, `ops`, `pts`, `mods[]`, `mats {cuerpo, frentes, encimera, jaladeras}` y `priceAdj`. El frontend lo guarda tal cual. `vestidor` se guarda como tipo `closet` en la columna `type`; el tipo exacto queda en `data.ptype`.
4. **El presupuesto sale del catálogo, no de la fórmula de muestra del prototipo.** El `price()` del prototipo usaba importes fijos en "US$×18". Aquí cada módulo suma:
   - **Tableros:** área del despiece × precio por m² del material × (1 + merma).
   - **Herrajes:** bisagras, correderas, jaladeras según la apertura, patas y tubos.
   - **Mano de obra** del módulo.
   - **Electrodomésticos:** precio completo.

   Después se agregan, en este orden: la encimera, el margen, la instalación (%), el descuento (%) y el impuesto (ITBIS), y al final el redondeo. Se respetan los ajustes manuales del prototipo (`pOv` por módulo, `priceAdj.counter` y `priceAdj.final`), que se interpretan en US$ como en el prototipo.
5. **Los errores de validación bloquean la aprobación.** En el prototipo solo eran avisos; la especificación exige bloquear. Con las reglas portadas, **la cocina de ejemplo del prototipo tiene un error real**: el fregadero queda a 120 cm de la toma de agua (máximo 60). Hay que mover la toma o el fregadero antes de aprobar.
6. **Un proyecto aprobado no se edita** (409 `PROYECTO_APROBADO`): se duplica. Sus importes salen siempre del `pricing_snapshot` de la versión aprobada, tanto en el detalle como en el listado. Por eso cambiar la tasa o los precios no los altera.
7. **Solo un enlace de aprobación vivo por proyecto:** enviar uno nuevo revoca los anteriores. Enviar al cliente también exige que el proyecto no tenga errores.
8. **Versiones:** se crean al pasar a fase 3, al enviar al cliente, al aprobar internamente y a mano. Una aprobación pública apunta a la versión que se envió.
9. **Precios en la biblioteca:** los diseñadores pueden subir texturas y módulos, pero los campos de precio solo los fija un admin; para otros roles se ignoran.
10. **Rate limit en memoria**, por IP y por cuenta en el login, y por IP y por token en `/public`. Alcanza para una instancia. Si escalas a varias réplicas, cámbialo por Redis detrás de la misma interfaz (`src/lib/rate-limit.ts`).
11. **Descontinuados:** borrar un módulo o material lo desactiva, no lo elimina. Los proyectos que lo usan muestran el aviso `DESCONTINUADO` (en `discontinued` y en `/validate`). Cada edición incrementa `version`, y si un módulo cambió desde que se colocó aparece el aviso `VERSION_ANTERIOR`.

## Estructura

```
src/
  app.ts            App Hono: middleware, errores, rutas, OpenAPI y /docs
  server.ts         Servidor Node (Easypanel / local); migra si RUN_MIGRATIONS=true
  deps.ts           Construye BD, almacenamiento y correo desde variables de entorno
  core/             Núcleo compartido con el frontend (no editar aquí)
  db/               schema.ts, client.ts (pg / Neon / PGlite), migrate.ts, seed.ts
  lib/              errores, permisos, sesiones, dinero, paginación, auditoría, rate limit
  routes/           una ruta por recurso
  services/         proyectos, precios, aprobaciones, archivos, medios, biblioteca, correo, almacenamiento
drizzle/            migraciones SQL versionadas
tests/              pruebas de integración (PGlite)
Dockerfile          imagen de producción
```
