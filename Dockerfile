FROM node:24-bookworm AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build
# Compile migration script using esbuild (bundled with vite, or npx)
RUN npx esbuild src/db/migrate.ts --bundle --platform=node --format=esm --outfile=.output/server/migrate.mjs --external:better-sqlite3 --external:drizzle-orm

# Production image, copy all the files and run next
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Install production dependencies only
# We use the full image (base) to ensure we have build tools for better-sqlite3
RUN npm pkg delete scripts.prepare && npm ci --omit=dev

FROM node:24-bookworm-slim AS runner
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
