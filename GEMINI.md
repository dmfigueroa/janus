# Janus Project Rules & Guidelines

## 1. Project Overview

Janus is a premium watchlist application designed to track movies and TV shows
in release order. The project prioritizes a high-quality, responsive user
experience with a modern aesthetic.

## 2. Technology Stack

- **Framework**: TanStack Start
- **Database**: SQLite (via Drizzle ORM with migrations)
- **Deployment**: Docker
- **UI Styling**: Tailwind CSS v4
- **Component Library**: shadcn/ui
- **Runtime/Package Manager**: Bun

## 3. Core Principles

- **Minimal Dependencies**: Avoid adding new dependencies unless absolutely
  necessary. Prefer implementing simple utilities over importing heavy
  libraries.
- **Functional Programming**: Use functional patterns where possible. Avoid
  class-based components or complex object-oriented patterns unless required by
  the framework.
- **Simplicity**: Write code that is easy to read and maintain. Complexity
  should be isolated.
- **Type Safety**: strict TypeScript usage. No `any` type allowed.

## 4. Design & Aesthetics

- **Visual Style**: Premium, modern, and vibrant.
- **Theme**: Dark mode by default with vibrant accent colors (e.g., deep reds,
  glassmorphism effects).
- **Interactivity**: Use subtle micro-animations and transitions to make the app
  feel "alive".
- **Typography**: Clean, sans-serif fonts (e.g., Inter, Outfit).
- **Components**: Use shadcn/ui components as a base, but customize them heavily
  to match the premium brand.

## 5. Development Workflow

- **Package Management**: Always use `bun` for installing packages and running
  scripts.
- **Database**:
  - Use Drizzle Kit for migrations.
  - Ensure `schema.ts` is the source of truth.
  - Run migrations manually or via a controlled script, verifying against the
    local SQLite file.
- **Styling**:
  - Use Tailwind v4 for all styling.
  - Avoid standard CSS files where utility classes can suffice, except for
    global themes/animations.
  - Design first: Ensure the UI "wows" before considering the task complete.

## 6. Directory Structure

- `src/routes`: TanStack Start file-based routing.
- `src/components`: Reusable UI components.
- `src/db`: Drizzle schema and connection logic.
- `src/utils`: Helper functions (keep minimal).

## 7. Best Practices

- **Server State**: Leverage TanStack Query (via TanStack Start) for data
  fetching.
- **Validation**: Use Zod for schema validation (forms, API responses).
- **Accessibility**: Ensure all components are accessible (aria labels, keyboard
  nav).
- **Docker**: Ensure the app builds and runs correctly in a containerized
  environment.
