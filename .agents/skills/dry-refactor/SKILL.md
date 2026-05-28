# DRY Refactoring Skill

Use this skill when the user asks to "refactor duplicate code", "apply DRY principles", "eliminate code repetition", "extract common functionality", or mentions code duplication, similar patterns, repeated logic, or reusable abstractions.

## Process

1. **Identify** - Exact copies, similar patterns, parallel hierarchies, naming patterns (data1/data2, handleXClick), repeated type literals
2. **Analyze** - Coupling, cohesion, frequency (Rule of Three: wait for 3+ occurrences), volatility
3. **Refactor** - Choose technique below, extract incrementally, test after each step

## Techniques

### Extract Function - Same logic in multiple places

```ts
// Before
const adminDisplay = `${admin.firstName} ${admin.lastName}`;
const userDisplay = `${user.firstName} ${user.lastName}`;

// After
function getFullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}
```

### Reuse/Infer Types - Replace repeated type literals

```ts
// Before - repeated literal types
function fetchWatchlist(watchlistId: number): { id: number; itemOrderMode: "release" | "custom" };
function createWatchlist(input: { itemOrderMode: "release" | "custom" });

// After - use inferred or exported types
import { watchlists } from "@/db/schema";
type WatchlistItemOrderMode = (typeof watchlists.itemOrderMode)["enum"][number];

function fetchWatchlist(
  watchlistId: number,
): Pick<typeof watchlists.$inferSelect, "id" | "itemOrderMode">;
function createWatchlist(input: { itemOrderMode: WatchlistItemOrderMode });
```

When types are already defined in the schema or domain layer, prefer:

- `typeof schema.$inferSelect["fieldName"]`
- `typeof schema.field["enum"][number]`
- Exported domain types over inline literals

### Extract Function - Same logic in multiple places

### Extract Variable - Repeated expression

```ts
// Before
if (user.age >= 18 && user.age < 65 && user.isActive) {
  /* ... */
}

// After
const isWorkingAge = user.age >= 18 && user.age < 65;
if (isWorkingAge && user.isActive) {
  /* ... */
}
```

### Parameterize - Code differs only in values

```ts
// Before
if (item.mediaType === "movie") {
  /* ... */
}
if (item.mediaType === "book") {
  /* ... */
}

// After
function validateByType(item: MediaItem, allowedTypes: MediaType[]) {
  return allowedTypes.includes(item.mediaType);
}
```

### Extract Class - Related functions scattered

```ts
// Before - validation logic in multiple places

// After
class ItemValidator {
  validate(item: WatchlistItem): ValidationResult {}
  sanitizeForInsert(item: WatchlistItem): InsertFields {}
}
```

### Polymorphism - Repeated switch/if-else

```ts
// Before
if (mode === "release") {
  /* ... */
}
if (mode === "custom") {
  /* ... */
}

// After
interface OrderModeStrategy {
  execute(transaction: Transaction, item: Item, destination: Watchlist): void;
}
const strategies: Record<OrderMode, OrderModeStrategy> = {
  release: new ReleaseModeStrategy(),
  custom: new CustomModeStrategy(),
};
```

### Strategy Pattern - Duplicated algorithm selection

```ts
// Before
if (sortType === "date") items.sort(byDate);
if (sortType === "name") items.sort(byName);

// After
const strategies = { date: byDate, name: byName };
items.sort(strategies[sortType] ?? byPriority);
```

### Pull Up Method - Identical methods in subclasses

```ts
// Before
class MovieItem {
  getDisplayTitle() {
    return this.title;
  }
}
class BookItem {
  getDisplayTitle() {
    return this.title;
  }
}

// After
class MediaItem {
  getDisplayTitle() {
    return this.title;
  }
}
```

### Configuration over code - Use data structures to eliminate conditionals

```ts
// Before
if (type === "movie") icon = "film";
if (type === "book") icon = "book";

// After
const MEDIA_ICONS: Record<MediaType, string> = {
  movie: "film",
  book: "book",
};
```

## Detection

### Code Smells to watch for:

- Numbered variables (data1, data2)
- Parallel function names (handleXClick)
- Near-identical code differing only in constants
- Repeated validation/error handling
- Parallel class structures
- Large switches in multiple places
- Repeated null checks
- Magic numbers
- **Repeated type literals** (e.g., `"release" | "custom"`, `{ id: number; name: string }`) - always prefer exported/inferred types

### Rule of Three

Wait for **3+ occurrences** before abstracting. Two copies might be coincidence; three suggests a pattern worth capturing.

## When NOT to DRY

- **Coincidental similarity** - Avoid abstracting different domains/business rules that happen to look alike (will diverge)
- **Premature abstraction** - Wait until pattern is clear; early abstraction often guesses wrong
- **Single use** - Skip abstraction when code appears 1-2 times and is unlikely to grow
- **Test clarity** - Prefer readable test setup over DRY
- **Over-engineering** - Avoid abstracting every 2-3 line similarity

## Best Practices

- Refactor only after tests pass (green)
- Apply one refactoring at a time
- Commit changes frequently
- Name abstractions for intent, not implementation
- Consider performance impact of abstractions
- Review abstractions with team before finalizing

## Workflow

1. Run existing tests to establish baseline (green)
2. Identify all occurrences of the duplication
3. Choose the appropriate refactoring technique
4. Extract incrementally — extract one piece at a time
5. Run tests after each step to ensure nothing breaks
6. Commit after each successful refactoring
7. Verify with linter and type checker
