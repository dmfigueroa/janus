# AGENTS

## Route And Feature Boundaries

- Keep small route-specific loader logic in the route file. Param parsing, route defaults, redirects, and `notFound` handling usually belong in the route.
- Do not extract route loaders into wrapper functions unless the extraction adds real value through reuse, deeper domain logic, or a stable shared boundary.
- Shared route modules must not import `.server` modules directly. Routes are part of the shared module graph, and direct `.server` imports can leak server-only dependencies into the client bundle.
- Avoid `index.ts` / `index.server.ts` barrels unless they provide a clear, durable navigation benefit.
- Prefer short, domain-based filenames and folders over thin wrapper modules.

<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "TanStack Start app structure, router setup, root shell, and entries"
  load: "/home/niika/janus/node_modules/@tanstack/react-start/skills/react-start/SKILL.md"
- task: "route loaders, staleTime, pending states, and router context wiring"
  load: "/home/niika/janus/node_modules/@tanstack/router-core/skills/router-core/data-loading/SKILL.md"
- task: "dynamic route params like $watchlistId and route param parsing"
  load: "/home/niika/janus/node_modules/@tanstack/router-core/skills/router-core/path-params/SKILL.md"
- task: "notFound handling, error boundaries, and route error behavior"
  load: "/home/niika/janus/node_modules/@tanstack/router-core/skills/router-core/not-found-and-errors/SKILL.md"
- task: "createServerFn, server/client execution boundaries, and server-only imports"
load: "/home/niika/janus/node_modules/@tanstack/start-client-core/skills/start-core/server-functions/SKILL.md"
<!-- intent-skills:end -->
