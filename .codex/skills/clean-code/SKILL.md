---
name: clean-code
description: Review code passed by the user against clean code principles. Use when the user asks for a clean code review, maintainability review, readability review, or feedback on SRP, cyclomatic complexity, declarative vs imperative style, comment quality or absence, idiomatic language usage, or language-specific conventions.
---

This skill reviews code for maintainability and clarity. Treat it as a code review skill focused on design quality, not just formatting.

Review only the code the user points to, plus the minimum surrounding context needed to judge conventions and intent.

Bias toward findings that improve local reasoning, explicit contracts, and safe changeability. Prefer reviews that tell the user which problems deserve action now versus which ones are acceptable tradeoffs for the current scope.

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

   Explicitly distinguish between:
   - fix now: the code is carrying avoidable complexity, a misleading abstraction, or a fragile contract that is already hurting readability or change safety
   - acceptable tradeoff: the code is not ideal, but the extra abstraction or rewrite would not clearly improve the current shape
   - future pressure point: the code is acceptable today but likely to become a problem if the surrounding feature grows

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
- multiple booleans represent one workflow or state machine
- loops and mutation obscure intent
- error handling is duplicated or interleaved with happy-path logic
- one function requires keeping too much state in mind at once
- nullable pairs or tuple-like return shapes force the caller to infer state from combinations
- control flow depends on string messages or display text instead of typed outcomes

Prefer early returns, extraction of decision points, table-driven logic, and clearer data shaping where appropriate.

When the code is modeling a workflow with mutually exclusive phases, strongly prefer a discriminated union, tagged result, or other explicit state-machine shape over overlapping booleans, nullable fields, or message-based protocols.

### Declarative Style

Prefer declarative code by default.

Good signals:

- data transformations are expressed as transformations
- repeated branching can become lookup tables, polymorphism, or dedicated helpers
- orchestration reads top-down without incidental mutation

Treat imperative bookkeeping as a design smell unless it is strictly required by the language or runtime boundary.

Do not excuse imperative code on the grounds of familiarity alone. Declarative code must still be judged against the rest of this skill's criteria: it should remain readable, cohesive, and simpler to reason about than the imperative alternative.

Do not blindly reward removing framework primitives if the replacement is a hand-rolled control loop that is harder to reason about. Judge the resulting shape, not the slogan. A no-effect rewrite that introduces a manual async state machine may still be a clean-code regression.

### Readability

Flag:

- names that hide intent
- helpers whose contracts are unclear
- misleading levels of abstraction in the same function
- unnecessary cleverness
- long stretches of code with no obvious narrative

Prefer code that can be understood in one pass.

Also flag abstraction layers that make the codebase harder to read overall:

- wrapper hooks or helpers with only one caller and little semantic weight
- indirection that merely passes state through without clarifying the model
- abstractions whose names are broader or vaguer than the responsibility they actually own
- helper APIs that force the caller to reconstruct hidden invariants or protocols

Do not recommend extracting a helper or hook unless the new boundary has a clear, nameable responsibility and improves local reasoning for the caller.

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

When async cancellation, polling, or manual coordination is unavoidable, expect either:

- a very clear abstraction boundary that makes the protocol obvious from naming, or
- a short why-comment at the fragile boundary

### Idioms And Conventions

Infer the standard from the language and repository:

- TypeScript/JavaScript: clear function boundaries, explicit naming, avoid needless mutation, match project async/error patterns
- React: derive UI where possible, avoid overstuffed components, keep hooks and side effects disciplined
- Go: simple control flow, small focused functions, conventional error handling, avoid framework-style abstraction creep
- Python: readable over clever, leverage standard idioms, keep data flow explicit
- Rust: model invariants in types, keep ownership/error boundaries clear, avoid obscuring control flow

If the repository already follows a stronger local convention than the language default, prefer the repository convention.

#### React-specific review rules

Apply these rules whenever the reviewed code includes React components or hooks:

- Treat `useEffect` as justified only when synchronizing with systems outside React, such as network subscriptions, timers, DOM APIs, imperative third-party widgets, browser APIs, or other truly external systems.
- Flag `useEffect` when it is being used to:
  - derive state from props or other React state
  - react to internal workflow changes after the fact instead of handling them in the original event path
  - reset local state in response to prop changes when the reset can happen at the event boundary
  - copy one piece of React state into another piece of React state without a strong external reason
- Prefer event handlers, derived values, keyed resets, discriminated unions, and explicit async functions over effect-driven orchestration for internal app logic.
- If an effect is removed, review the replacement critically. Replacing a small effect with a sprawling manual polling loop, ad hoc cancellation protocol, or implicit control flow is not automatically cleaner.
- Treat single-caller wrapper hooks with suspicion. If a hook mostly glues together local state and a couple of lower-level hooks for one component, prefer leaving that coordination in the component unless the wrapper names a real domain concept or materially improves readability.
- Prefer custom hooks when they encapsulate one stable responsibility with a clear contract. Avoid hooks that mix fetching, validation, workflow orchestration, UI side effects, and presentation shaping unless that combined boundary is genuinely cohesive.

#### Typed-state guidance

For TypeScript and similar typed languages, strongly prefer explicit, typed state and result modeling:

- Use discriminated unions for mutually exclusive states
- Use typed result objects instead of nullable sibling fields that must be interpreted together
- Use semantic status values instead of multiple overlapping booleans
- Use typed control-flow variants such as `cancelled`, `failed`, `completed`, `started` instead of branching on user-visible messages

Flag code that makes illegal states representable when a reasonable type-level alternative exists.

## Output Format

Default to review mode.

Start with findings, ordered by severity. For each finding include:

- location
- what is wrong
- why it matters
- what cleaner code would look like
- recommendation level: `fix now`, `acceptable tradeoff`, or `future pressure point`

After findings, include:

- open questions or assumptions
- a short summary only if useful

If there are no meaningful findings, say so explicitly and mention residual risks or missing context.

When there are no meaningful findings, do not invent stylistic filler. State clearly that the code is in good shape, then mention only the highest-signal residual risk if one exists.

## Tone

Be direct and specific. Avoid vague statements like "could be cleaner" or "consider refactoring" without naming the actual problem.

Prefer:

- "This function mixes validation, persistence, and response shaping, which gives it multiple reasons to change."
- "This branching structure forces the reader to track four states at once."

Avoid:

- generic clean code slogans
- hiding stylistic nitpicks just because they are small; surface them clearly as lower-severity findings when relevant
- recommending abstractions with no clear payoff
- treating every non-ideal shape as equally urgent
- praising a refactor just because it removed a framework primitive while making the resulting control flow harder to understand

Style nitpicks are allowed and should come through in the review when they reflect established conventions, readability improvements, or consistency concerns. Mark them as low severity or nits where appropriate and leave implementation priority to the user.
