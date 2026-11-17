# Janus

**Janus** is a premium watchlist application designed to help you track movies and TV shows in their functionality release order. built with a modern stack focusing on performance, aesthetics, and user experience.

## ✨ Features

- **Timeline View**: Track your content in the exact order it released. Perfect for cinematic universes (Marvel, DC, Star Wars).
- **Smart Watchlists**: Create multiple lists for different franchises or viewing goals.
- **TMDB Integration**: Seamless search and data fetching from The Movie Database (movies & TV episodes).
- **Progress Tracking**: Visual indicators for your viewing progress and what's "Up Next".
- **Premium UI/UX**:
  - Dark/Light mode support (system sync).
  - Smooth micro-animations and transitions.
  - Mobile-optimized with safe-area handling.
  - Glassmorphism and vibrant accent colors.
- **Local-First Architecture**: Powered by SQLite for fast, reliable data persistence.

## 🛠️ Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (Full-stack React framework)
- **Database**: [SQLite](https://sqlite.org/) via [Drizzle ORM](https://orm.drizzle.team/)
- **Styling**: [Chakra UI](https://chakra-ui.com/) with a centralized Janus theme
- **Runtime**: [Node.js](https://nodejs.org/)
- **Quality**: [Oxlint](https://oxc-project.github.io/op/oxlint) & [Vitest](https://vitest.dev/)

## 🚀 Getting Started

### Prerequisites

- [Podman](https://podman.io/)
- [Dev Container CLI](https://github.com/devcontainers/cli)
- [mise](https://mise.jdx.dev) for the host fallback only (see [Host Installation](#host-installation))

The recommended development environment is defined by `.devcontainer/devcontainer.json`. It builds
with Podman and installs the supported Node.js version and native build tools needed by dependencies
such as `better-sqlite3`.

### Create The Dev Container

1. Clone the repository:

   ```bash
   git clone https://github.com/dmfigueroa/janus.git
   cd janus
   ```

2. Build and start the development container with Podman:

   ```bash
   devcontainer up --workspace-folder . --docker-path podman
   ```

3. Install dependencies inside the devcontainer:

   ```bash
   devcontainer exec --workspace-folder . --docker-path podman npm install
   ```

4. Create `.env` in the repository root. `TMDB_API_KEY` is needed for TMDB search; the other provider
   keys enable their corresponding integrations:

   ```dotenv
   TMDB_API_KEY=
   RAWG_API_KEY=
   COMICVINE_API_KEY=
   GOOGLE_BOOKS_API_KEY=
   DATABASE_URL=sqlite.db
   ```

### Run Commands With Podman

To run commands with Podman directly, locate the generated container by its workspace label instead
of relying on its random container name:

```bash
JANUS_CONTAINER="$(podman ps -a \
  --filter "label=devcontainer.local_folder=$(pwd)" \
  --format '{{.Names}}')"
podman start "$JANUS_CONTAINER"
podman exec --workdir /workspaces/janus "$JANUS_CONTAINER" npm test
```

Run `podman ps -a --filter "label=devcontainer.local_folder=$(pwd)"` to confirm that the selected
container belongs to this checkout. Do not use an unrelated Toolbox or development container: native
Node modules must be executed with the same Node.js ABI used when `npm install` compiled them.

### Host Installation

Running directly on the host is supported when the devcontainer cannot start. The repository pins
Node.js in `.tool-versions`, and a bare host `node` may be a newer major without a
`better-sqlite3` prebuilt binary, so run installs through the wrapper that pins it:

```bash
bash tools/pinned-node.sh npm ci
```

The wrapper runs the command under the `.tool-versions` Node through
[mise](https://mise.jdx.dev). It also needs the native compiler toolchain required by
`better-sqlite3` and the Rust toolchain for the v2 tests. Run `bash tools/pinned-node.sh npm run dev`
the same way.

### Running Locally

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000` to see the app.

### Database Management

Janus uses Drizzle ORM with SQLite. The database file is created locally.

- **View Database UI**:

  ```bash
  npm run db:studio
  ```

  This opens Drizzle Studio, allowing you to visually manage your SQLite data.

- **Lint & Format**:

  ```bash
  npm run lint
  npm run format
  ```

- **Run Tests**:
  ```bash
  npm run test
  ```

## 🚀 Deployment

To build the application for production:

```bash
npm run build
```

This will compile the application. You can preview the production build locally using:

```bash
npm run preview
```

The Dockerfile under `.devcontainer/` is for development only; it is not a production deployment
image.

## 📂 Project Structure

- See `ARCHITECTURE.md` for the target file structure and dependency rules.
- See `CONTRIBUTING.md` for the file placement guide.
- `src/routes`: TanStack Start route entrypoints.
- `src/features`: Feature-owned business logic, screens, queries, mutations, and tests.
- `src/app`: App shell, router setup, and global chrome.
- `src/ui`: Reusable design-system primitives.
- `src/shared`: Small set of cross-feature helpers and hooks.
- `src/integrations`: External API adapters.
- `src/db`: Drizzle schema, connection, and migrations.

## 📝 Roadmap & Todo

- [ ] **Delete items**: Add functionality to delete movies and shows from the watchlist.
- [ ] **Infinite Scroll Polish**: Optimize the search results pagination and infinite loading experience.
- [ ] **Watchlist visual polish**: Enhance the "Up Next" cover art logic and progress bars in the card view.
- [ ] **Authentication**: Add user accounts (e.g., via BetterAuth or Auth.js) to support multiple users and cloud sync.
- [ ] **Detailed Views**: Create dedicated pages for Movie/TV Show details with more metadata (cast, crew, related).
- [ ] **Import/Export**: Allow exporting watchlists to JSON/CSV.
- [ ] **Advanced Filtering**: Filter timelines by watched status, runtimes, or release years.
- [ ] **Unit Testing**: Increase test coverage for critical utility functions and components.

## 📄 License

MIT
