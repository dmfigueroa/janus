# syntax=docker/dockerfile:1

# Node 24 with the native toolchain needed to install the better-sqlite3 addon.
FROM node:24.18.0-bookworm AS base

# ---------------------------------------------------------------------------
# deps — install the full dependency tree once. This layer is keyed only on the
# manifests, so it stays cached until package.json / package-lock.json change.
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci installs the Linux native oxc & better-sqlite3 bindings from the lock.
RUN --mount=type=cache,target=/root/.npm \
  npm pkg delete scripts.prepare \
  && npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# builder — build the Nitro node-server output plus standalone migration/seed
# scripts. Keyed on source after deps, so code edits reuse the cached deps layer.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build
# Compile migration and seed scripts using esbuild (bundled with vite).
RUN npx esbuild src/db/Migrate.ts --bundle --platform=node --format=esm --outfile=.output/server/migrate.mjs --external:better-sqlite3 --external:drizzle-orm \
  && npx esbuild src/db/Seed.ts --bundle --platform=node --format=esm --outfile=.output/server/seed.mjs --external:better-sqlite3 --external:drizzle-orm

# ---------------------------------------------------------------------------
# prod-deps — install only the runtime packages the bundled server and the
# migration/seed scripts import. React, Chakra, TanStack, etc. are already
# bundled by Vite/Nitro and must not bloat the runtime image.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Rebuild a minimal manifest pinned to the exact versions in the lockfile, then
# install just those two packages (and their transitive dependencies).
RUN --mount=type=cache,target=/root/.npm \
  node -e "const l=require('./package-lock.json').packages; const p={name:'janus-runtime',private:true,type:'module',dependencies:{'better-sqlite3':l['node_modules/better-sqlite3'].version,'drizzle-orm':l['node_modules/drizzle-orm'].version}}; require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
  && npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# runner — slim image with only the compiled output, migrations, and minimal
# runtime dependencies.
# ---------------------------------------------------------------------------
FROM node:24.18.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.output .output
COPY --from=builder /app/package.json .
COPY --from=prod-deps /app/node_modules .output/server/node_modules
COPY drizzle drizzle
# Ensured in case a deployment runs without the storage volume mounted.
RUN mkdir -p /app/storage

EXPOSE 3000

# Run migrations, then seed (no-op unless SEED_ON_STARTUP=true), then start server
CMD ["sh", "-c", "node .output/server/migrate.mjs && node .output/server/seed.mjs && node .output/server/index.mjs"]
