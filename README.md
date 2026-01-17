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
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/)
- **Runtime**: [Bun](https://bun.sh/)
- **Quality**: [Oxlint](https://oxc-project.github.io/op/oxlint) & [Vitest](https://vitest.dev/)

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/yourusername/janus.git
    cd janus
    ```

2.  Install dependencies:

    ```bash
    bun install
    ```

3.  Set up environment variables:
    Create a `.env` file in the root directory (if required by your TMDB helper, though checking the code, it might be hardcoded or using a default for now. _Note: Ensure you have a valid TMDB API Key if strictly required_).

### Running Locally

Start the development server:

```bash
bun run dev
```

Visit `http://localhost:3000` to see the app.

### Database Management

Janus uses Drizzle ORM with SQLite. The database file is created locally.

- **View Database UI**:

  ```bash
  bun run db:studio
  ```

  This opens Drizzle Studio, allowing you to visually manage your SQLite data.

- **Lint & Format**:

  ```bash
  bun run lint
  bun run format
  ```

- **Run Tests**:
  ```bash
  bun run test
  ```

## 🚀 Deployment

To build the application for production:

```bash
bun run build
```

This will compile the application. You can preview the production build locally using:

```bash
bun run preview
```

**Docker**:
The project is designed to be containerized. Ensure your `Dockerfile` (pending creation if not present) handles the build output and serves it using a Bun runtime.

## 📂 Project Structure

- `src/routes`: TanStack Start file-based routing.
- `src/components`: Reusable UI components (shadcn/ui customised).
- `src/db`: Drizzle schema (`schema.ts`) and connection logic.
- `src/server`: Server-side logic and TMDB API integration.
- `src/utils`: Helper functions.

## 📝 Roadmap & Todo

- [ ] **Add Dockerfile**: Create a Dockerfile to containerize the application.
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
