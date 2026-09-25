# syntax=docker/dockerfile:1
# Imagen para Easypanel (o cualquier host con Docker). Ver README → "Despliegue en Easypanel".

# A dropped connection to the npm registry (ECONNRESET) must not fail the deploy: npm retries each download
# with growing waits, the whole install is retried twice more, and the download cache survives between builds.
ARG NPM_RETRY="npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=20000 npm_config_fetch_retry_maxtimeout=120000"

FROM node:22-bookworm-slim AS build
ARG NPM_RETRY
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    env $NPM_RETRY sh -c 'npm ci || (sleep 15 && npm ci) || (sleep 45 && npm ci)'
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY frontend ./frontend
# Shown in the app's "Novedades" (imported by the frontend build).
COPY CHANGELOG.md ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ARG NPM_RETRY
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    RUN_MIGRATIONS=true \
    MIGRATIONS_DIR=/app/drizzle \
    UPLOADS_DIR=/data/uploads \
    BACKUP_DIR=/data/backups
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    env $NPM_RETRY sh -c 'npm ci --omit=dev || (sleep 15 && npm ci --omit=dev) || (sleep 45 && npm ci --omit=dev)'
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
RUN mkdir -p /data/uploads /data/backups && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
