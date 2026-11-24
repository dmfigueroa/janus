# Janus

**Janus** is a self-hosted media watchlist application for tracking movies, TV episodes, games, books, and comics in release or custom order, with configurable Watch Now lineups and an MCP server.

The repository includes **v1** (TanStack Start + React + Chakra UI under `src/`) and the in-progress **v2** rewrite (Rust + Axum + Askama + HTMX under `v2/`), both backed by the same SQLite database.

## Features

- **Release & Custom Timelines**: Track franchises in release order or curated custom order with drag/keyboard reordering and collapsible watched runs.
- **Multi-Media Search**: Integrations for TMDB (movies & TV), RAWG (games), Google Books, and ComicVine (comics), plus custom items.
- **Watch Now & Lineups**: Global recency rotation with automatic media-type lineups and custom lineups, plus pause and skip states.
- **MCP Server**: Model Context Protocol endpoint for reading and managing watchlists and lineups (see [`docs/mcp.md`](docs/mcp.md)).
- **Local-First Persistence**: SQLite database shared across v1 and v2, with schema migrations managed by Drizzle ORM.

## Tech Stack

- **v1 (`src/`)**: [TanStack Start](https://tanstack.com/start), React 19, [Chakra UI v3](https://chakra-ui.com/), [Drizzle ORM](https://orm.drizzle.team/), Node.js 24
- **v2 (`v2/`)**: Rust 1.94, Axum, Askama, SeaORM, `rmcp`, HTMX, SortableJS, Open Props
- **Database**: [SQLite](https://sqlite.org/)

## Local Development

### Prerequisites

- **Node.js 24** (`>=24.12 <26`, pinned in `.tool-versions` for [mise](https://mise.jdx.dev) / asdf), **pnpm** (via `corepack enable` or matching `packageManager` in `package.json`), and a C build toolchain for `better-sqlite3`
- **Rust 1.94** (pinned in `v2/rust-toolchain.toml`) if building or testing v2
- Alternatively, open the repository in any editor or CLI that supports [Dev Containers](https://containers.dev/) using `.devcontainer/devcontainer.json`

### Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/dmfigueroa/janus.git
   cd janus
   pnpm install --frozen-lockfile
   ```

2. Create a `.env` file in the repository root. `TMDB_API_KEY` enables movie/TV search; the other provider keys are optional and enable their respective integrations:

   ```dotenv
   TMDB_API_KEY=
   RAWG_API_KEY=
   COMICVINE_API_KEY=
   GOOGLE_BOOKS_API_KEY=
   DATABASE_URL=sqlite.db
   ```

3. Run migrations and start the development server:

   ```bash
   pnpm run migrate
   pnpm run dev
   ```

   Open `http://localhost:3000`.

To seed a disposable database with sample watchlists and launch both v1 (`http://localhost:3000`) and v2 (`http://localhost:3001/v2`) together:

```bash
pnpm run preview:local
```

### Common Commands

```bash
pnpm run dev           # Start v1 dev server on http://localhost:3000 (proxies /v2 -> 127.0.0.1:3001)
pnpm run preview:local # Seed a disposable DB and launch v1 + v2 locally
pnpm run migrate       # Apply Drizzle SQLite migrations
pnpm run db:studio     # Open Drizzle Studio to inspect SQLite data
pnpm run lint          # Run linters and module checks
pnpm run format        # Format code and docs with oxfmt
pnpm run typecheck     # TypeScript type check
pnpm run test          # Run v1 test suite (Vitest)
pnpm run test:v2       # Run v2 Rust test suite (Cargo)
pnpm run test:v2:dom   # Run v2 HTMX/reorder DOM tests
```

## Deployment

Janus ships production Dockerfiles at the repository root (`Dockerfile` for v1 on port `3000`, `v2/Dockerfile` for v2 on port `3001`):

```bash
docker build -f Dockerfile -t janus-v1 .
docker build -f v2/Dockerfile -t janus-v2 .
```

Mount a persistent directory at `/app/storage` (with `DATABASE_URL=/app/storage/sqlite.db`) and provide your provider API keys as environment variables. On startup, the v1 image automatically runs database migrations before starting the server. Set `SEED_ON_STARTUP=true` only on disposable demo/preview instances to populate sample watchlists into an empty database.

For running v1 and v2 side by side behind a reverse proxy, see [`deploy/README.md`](deploy/README.md). For protecting `/mcp` with Cloudflare Access Managed OAuth, see [`docs/mcp.md`](docs/mcp.md).

## Project Structure

- `src/`: v1 TanStack Start application (`app/`, `routes/`, `features/`, `components/`, `shared/`, `integrations/`, `db/`). See [`ARCHITECTURE.md`](ARCHITECTURE.md).
- `v2/`: v2 Rust application (`src/`, `templates/`, `static/`, `tests/`). See [`v2/README.md`](v2/README.md).
- `drizzle/`: SQLite Drizzle migrations.
- `deploy/`: Container deployment notes (`deploy/README.md`) and Docker Compose example.
- `docs/`: Architecture decision records (`docs/adr/`) and MCP setup/contracts (`docs/mcp.md`).
- `test/` & `tools/`: Test suites, linters, and developer scripts.

## License

MIT
