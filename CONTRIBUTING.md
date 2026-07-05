# Contributing

Use this document to decide where new code belongs. `ARCHITECTURE.md` defines the target structure and boundary rules. This file is the practical placement guide.

## Placement Workflow

When adding or moving code, ask these questions in order.

1. Is this a URL or route concern?
   Put it in `src/routes/*`.
   Examples: param parsing, `validateSearch`, redirects, `notFound`, `loaderDeps`, route cache priming, route-level data loading, and straightforward page assembly from feature-owned components.
2. Is this business logic or UI for one product area?
   Put it in `src/features/<feature>/*`.
3. Is this UI reused across multiple use cases within one feature?
   Put it in `src/features/<feature>/components/*`.
4. Is this app shell or global chrome?
   Put it in `src/app/*`.
5. Is this a reusable design-system primitive?
   Put it in `src/ui/*`.
6. Is this a low-level external API adapter or SDK wrapper?
   Put it in `src/integrations/*`.
7. Is this database schema, connection, or migration code?
   Put it in `src/db/*`.
8. Is this truly cross-feature and already used by at least two real consumers?
   Put it in `src/shared/*`.

If the answer is no at every step, keep the code in the owning feature until a clearer shared boundary emerges.

## Common Recipes

### New Route

- Add the route file under `src/routes/*`.
- Keep URL behavior and route-level page assembly in the route file.
- Load data through safe feature query or mutation surfaces.
- Compose feature-owned components directly when the route is mostly arranging already-focused pieces.
- Create a feature `screen.tsx` only when the page composition is substantial enough to deserve its own module.

Example:

```text
src/routes/watchlists/$watchlistId.tsx
src/features/watchlists/detail/screen.tsx
src/features/watchlists/detail/query.ts
src/features/watchlists/detail/query.server.ts
```

### New Read Use Case

- Create a shallow use-case folder under the owning feature.
- Put the safe entrypoint in `query.ts`.
- Put server-only logic in `query.server.ts`.
- Put page-sized UI in `screen.tsx` when the page composition has its own meaningful responsibility beyond route-level assembly.
- Collocate tests.

Example:

```text
src/features/search/search/
  query.ts
  query.server.ts
  screen.tsx
  schema.ts
  query.test.ts
```

### New Write Use Case

- Create a shallow use-case folder under the owning feature.
- Put the safe entrypoint in `mutation.ts`.
- Put server-only logic in `mutation.server.ts`.
- Put validation in `schema.ts` if it has meaningful reuse or size.

Example:

```text
src/features/watchlists/create/
  mutation.ts
  mutation.server.ts
  schema.ts
```

### UI Shared Inside One Feature

- Use `src/features/<feature>/components/*`.
- Do not promote it to `src/shared/*` or `src/ui/*` just because two files in one feature use it.

### App-Wide Shared Utility Or Hook

- Keep it out of `src/shared/*` until a second real consumer exists.
- If it lands in `src/shared/*`, keep it generic and stable.

### New External Provider

- Put the adapter in `src/integrations/<provider>/*.server.ts`.
- Keep provider-specific request and response mapping there.
- Let feature server files orchestrate business behavior on top of it.

## Naming Rules

- Name files by the responsibility they capture, not just their role. The filename should tell you the domain concept. For example, `insert-ordered-item.server.ts` is better than `mutation.server.ts` because it describes what the module does.
- Prefer short role-based filenames (`query.ts`, `mutation.ts`, `schema.ts`) when the responsibility is a standard CRUD operation. Use descriptive names when the responsibility is a specific domain concept.
- Use `.server.ts` for any file that touches the database, secrets, file system, or server-only SDKs.
- Avoid `index.ts` and `index.server.ts` unless they provide clear, durable navigation value.
- Keep tests next to the code they verify.

## TanStack Start Rules

- Routes and other client-safe modules must not import `.server.ts` files directly.
- React components must call server functions through `useServerFn(serverFn)`.
- `createServerFn` surfaces should return structured expected failures instead of throwing.
- Do not use `"use server"` or `"use client"` directives unless a documented framework requirement leaves no alternative.

## Agent Workflow

- Read `ARCHITECTURE.md` before adding new modules or moving existing ones.
- Use this file to pick the destination path before writing code.
- Prefer incremental migration in touched areas over large opportunistic reorganizations.
- If nearby legacy structure conflicts with the target shape, place new code according to the target shape and only move touched files when the move materially reduces confusion.
- When the right location is still unclear, prefer the smallest change that strengthens feature ownership and the safe/server split.
