---
name: clean-code
description: Review code passed by the user against clean code principles. Use when the user asks for a clean code review, maintainability review, readability review, or feedback on SRP, cyclomatic complexity, declarative vs imperative style, comment quality or absence, idiomatic language usage, or language-specific conventions.
---

This skill reviews code for maintainability and clarity. Treat it as a code review skill focused on design quality, not just formatting.

Review only the code the user points to, plus the minimum surrounding context needed to judge conventions and intent.

## Review Goals

Evaluate the code against these dimensions:

- SRP: Does a unit have one clear reason to change, or is it mixing unrelated responsibilities?
- Complexity: Flag excessive branching, nesting, state transitions, or control flow. Call out likely cyclomatic complexity issues even if no exact metric is available.
- Declarative over imperative: Always prefer declarative code over imperative code. Review whether the declarative shape still preserves readability, keeps responsibilities focused, and does not introduce avoidable complexity.
- Readability: Naming, structure, cohesion, local reasoning, and whether the code explains itself without mental backtracking.
- Comments: Flag missing comments when intent is non-obvious, and flag low-value comments that restate the code instead of explaining why.
- Idiomatic code: Judge whether the code matches the language, framework, and project conventions already present.
- Language conventions: Check naming, file organization, error handling, control flow, and abstraction style against the norms of the specific language.

## Workflow

1. Identify the review target.
   If the user passed a file, diff, function, or snippet, review that exact scope first.

2. Load minimal context.
   Read nearby files only when needed to infer naming, architecture, or language/framework conventions.

3. Look for concrete findings.
   Prioritize bugs, maintainability risks, design drift, and readability regressions over generic advice.

4. Judge severity.
   Prefer findings that would materially improve comprehension, change safety, testability, or ease of extension.

5. Propose a sharper alternative.
   When you call out an issue, explain the cleaner shape of the code. Include a small rewrite only if it clarifies the recommendation.

## Heuristics

### SRP

Flag code when one unit:

- validates, transforms, persists, and formats output in one place
- mixes domain logic with transport, UI, or storage concerns
- coordinates workflow while also owning low-level implementation details

Do not force indirection when a small function is already cohesive.

### Complexity

Flag code when:

- nested conditionals hide the main path
- boolean flags create multiple execution modes
- loops and mutation obscure intent
- error handling is duplicated or interleaved with happy-path logic
- one function requires keeping too much state in mind at once

Prefer early returns, extraction of decision points, table-driven logic, and clearer data shaping where appropriate.

### Declarative Style

Prefer declarative code by default.

Good signals:

- data transformations are expressed as transformations
- repeated branching can become lookup tables, polymorphism, or dedicated helpers
- orchestration reads top-down without incidental mutation

Treat imperative bookkeeping as a design smell unless it is strictly required by the language or runtime boundary.

Do not excuse imperative code on the grounds of familiarity alone. Declarative code must still be judged against the rest of this skill's criteria: it should remain readable, cohesive, and simpler to reason about than the imperative alternative.

### Readability

Flag:

- names that hide intent
- helpers whose contracts are unclear
- misleading levels of abstraction in the same function
- unnecessary cleverness
- long stretches of code with no obvious narrative

Prefer code that can be understood in one pass.

### Comments

Good comments explain:

- why a constraint exists
- why a surprising approach is necessary
- external assumptions, invariants, and edge cases

Flag comments that:

- restate the code
- have drifted from behavior
- compensate for avoidable complexity

Also flag missing comments when non-obvious invariants or tradeoffs would otherwise remain implicit.

### Idioms And Conventions

Infer the standard from the language and repository:

- TypeScript/JavaScript: clear function boundaries, explicit naming, avoid needless mutation, match project async/error patterns
- React: derive UI where possible, avoid overstuffed components, keep hooks and side effects disciplined
- Go: simple control flow, small focused functions, conventional error handling, avoid framework-style abstraction creep
- Python: readable over clever, leverage standard idioms, keep data flow explicit
- Rust: model invariants in types, keep ownership/error boundaries clear, avoid obscuring control flow

If the repository already follows a stronger local convention than the language default, prefer the repository convention.

## Output Format

Default to review mode.

Start with findings, ordered by severity. For each finding include:

- location
- what is wrong
- why it matters
- what cleaner code would look like

After findings, include:

- open questions or assumptions
- a short summary only if useful

If there are no meaningful findings, say so explicitly and mention residual risks or missing context.

## Tone

Be direct and specific. Avoid vague statements like "could be cleaner" or "consider refactoring" without naming the actual problem.

Prefer:

- "This function mixes validation, persistence, and response shaping, which gives it multiple reasons to change."
- "This branching structure forces the reader to track four states at once."

Avoid:

- generic clean code slogans
- hiding stylistic nitpicks just because they are small; surface them clearly as lower-severity findings when relevant
- recommending abstractions with no clear payoff

Style nitpicks are allowed and should come through in the review when they reflect established conventions, readability improvements, or consistency concerns. Mark them as low severity or nits where appropriate and leave implementation priority to the user.
