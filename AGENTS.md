# AGENTS

## Route And Feature Boundaries

- Keep small route-specific loader logic in the route file. Param parsing, route defaults, redirects, and `notFound` handling usually belong in the route.
- Do not extract route loaders into wrapper functions unless the extraction adds real value through reuse, deeper domain logic, or a stable shared boundary.
- Shared route modules must not import `.server` modules directly. Routes are part of the shared module graph, and direct `.server` imports can leak server-only dependencies into the client bundle.
- Avoid `index.ts` / `index.server.ts` barrels unless they provide a clear, durable navigation benefit.
- Prefer short, domain-based filenames and folders over thin wrapper modules.
