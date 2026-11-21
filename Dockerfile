FROM node:24.18.0-bookworm AS base
RUN corepack enable

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Hoist so the copied node_modules tree matches the runner layout (no broken pnpm symlinks).
RUN printf 'node-linker=hoisted\n' > .npmrc \
  && pnpm pkg delete scripts.prepare \
  && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.npmrc ./
COPY . .
ENV NITRO_PRESET=node-server
RUN pnpm run build
# Compile migration script using esbuild
RUN pnpm exec esbuild src/db/Migrate.ts --bundle --platform=node --format=esm --outfile=.output/server/migrate.mjs --external:better-sqlite3 --external:drizzle-orm

# Production image, copy all the files and run next
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Install production dependencies only
# We use the full image (base) to ensure we have build tools for better-sqlite3
RUN printf 'node-linker=hoisted\n' > .npmrc \
  && pnpm pkg delete scripts.prepare \
  && pnpm install --frozen-lockfile --prod

FROM node:24.18.0-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.output .output
COPY --from=builder /app/package.json .
COPY --from=prod-deps /app/node_modules .output/server/node_modules
# Copy migrations folder
COPY drizzle drizzle

# Expose port
EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "node .output/server/migrate.mjs && node .output/server/index.mjs"]
