---
name: clean-code
description: Review code passed by the user against clean code principles. Use when the user asks for a clean code review, maintainability review, readability review, or feedback on SRP, cyclomatic complexity, declarative vs imperative style, comment quality or absence, idiomatic language usage, or language-specific conventions.
user-invocable: true
risk: safe
source: local
---

This skill reviews code for maintainability and clarity. Treat it as a code review skill focused on design quality, not just formatting.

Review the exact code the user points to first, then load enough surrounding context to judge conventions, boundaries, and intent without drifting into an open-ended codebase tour.

Bias toward findings that improve local reasoning, explicit contracts, and safe changeability. Prefer reviews that tell the user which problems deserve action now versus which ones are acceptable tradeoffs for the current scope.

Default to SRP-first review. If the code has meaningful single-responsibility violations, focus the review almost entirely on those first and do not dilute the report with secondary concerns. The user can ask for another pass later.

This is also a house-style enforcement skill. Do not review as if all reasonable code styles are equally valid. Review against the preferred style in this file, then use repository precedent only to understand local intent and existing patterns.

## House Style

Treat these as the default style contract unless the user explicitly asks for a different standard:

- prefer domain logic to live under `src/server/models` in focused modules following TanStack Start server-only conventions
- prefer endpoint/server-fn entrypoints to live under `src/server/controllers`
- prefer jobs to live under `src/server/jobs`
- do not use `index` files outside route modules; name the file after the resource or concern instead
- prefer domain-oriented modules over generic service, manager, runner, helper, or utils layers
- prefer one cohesive module over multiple thin files that make the reader reconstruct the workflow
- prefer explicit typed state, tagged unions, and semantic result objects over overlapping booleans, null pairs, and message-based protocols
- prefer event-path logic, derived values, and explicit async functions over effect-driven orchestration for internal application behavior
- prefer names that describe the domain concept, not the implementation bucket or technical mechanism
- prefer helpers, hooks, and abstractions only when they introduce a real, nameable responsibility and improve local reasoning
- prefer comments that explain constraints, invariants, and tradeoffs; do not use comments to compensate for unclear code structure

If a pattern would be acceptable in many codebases but violates this house style, say so explicitly instead of softening the finding.

When the codebase does not consistently follow this style, do not invent fake certainty from existing patterns alone. Treat the house style in this file as the default standard, but if multiple approaches are genuinely valid or the right choice depends on the user's preference, say so and ask the user to choose.

Model organization guidance for this codebase:

- place domain modules in `src/server/models`
- name model files after the domain concept or resource they own
- prefer singular resource names such as `src/server/models/watchlist.ts` and `src/server/models/watchlist/import.ts`
- prefer adding behavior to an existing model module before creating a new service-style layer
- split a model into a subdirectory only when the child module names a real concern of that model
- do not hide model APIs behind `index.ts` or `index.server.ts`; use explicit filenames like `watchlist.ts` or `import.ts`
- do not create `service`, `manager`, `runner`, `utils`, or similar generic layer files when the behavior belongs to a model module

In cases of real ambiguity:

- do not pretend the repository already settled the question if the codebase is inconsistent
- do not elevate a weak local precedent into a rule
- present the tradeoff briefly
- ask the user which direction they want when the answer changes the recommendation materially

## Review Goals

Primary question:

- is it clear what this module, file, function, hook, or class does?
- is it doing just one thing?

If the answer is no, prioritize that above all other review dimensions.

Evaluate the code against these dimensions:

- SRP: Does a unit have one clear reason to change, or is it mixing unrelated responsibilities?
- Module and file boundaries: Do files, folders, and exports reflect the domain model, or are they split around generic technical layers, action prefixes, or arbitrary line-count concerns?
- Complexity: Flag excessive branching, nesting, state transitions, or control flow. Call out likely cyclomatic complexity issues even if no exact metric is available.
- Declarative over imperative: Always prefer declarative code over imperative code. Review whether the declarative shape still preserves readability, keeps responsibilities focused, and does not introduce avoidable complexity.
- Readability: Naming, structure, cohesion, local reasoning, and whether the code explains itself without mental backtracking.
- Comments: Flag missing comments when intent is non-obvious, and flag low-value comments that restate the code instead of explaining why.
- Idiomatic code: Judge whether the code matches the language, framework, and project conventions already present.
- Language conventions: Check naming, file organization, error handling, control flow, and abstraction style against the norms of the specific language.

## Workflow

1. Identify the review target.
   If the user passed a file, diff, function, or snippet, review that exact scope first.

2. Load the minimum viable context.
   Read enough nearby code to understand how the target fits into the local design.

   Minimum expectation unless the user gave a self-contained snippet:
   - the target file or diff
   - one nearby usage site, caller, callee, sibling module, or related type
   - one local convention source when needed, such as a neighboring module in the same area

   Do not stop at a single-file skim when the target clearly interacts with shared types, hooks, services, adapters, or framework boundaries.

3. Run a coverage pass before drafting findings.
   Check each dimension explicitly:
   - house-style alignment and any local exceptions worth preserving
   - responsibilities and reasons to change
   - module and file boundaries
   - control flow, branching, and state modeling
   - naming and local readability
   - comments, invariants, and hidden protocols
   - language and repository conventions

4. Look for concrete findings.
   Prioritize SRP violations first. If there are meaningful SRP problems, center the review on them and keep other findings to only the few that are inseparable from the SRP issue.

5. Decide whether SRP-first mode applies.
   SRP-first mode applies when one or more reviewed units fail either of these questions:
   - is it clear what this unit does?
   - is it doing just one thing?

   In SRP-first mode:
   - focus the report on responsibility boundaries, cohesion, and unclear ownership
   - do not pad the review with unrelated nits, convention notes, or lower-value style comments
   - mention secondary issues only when they directly contribute to the SRP problem or block the refactor direction

6. Judge severity.
   Prefer findings that would materially improve comprehension, change safety, testability, or ease of extension.

   Explicitly distinguish between:
   - fix now: the code is carrying avoidable complexity, a misleading abstraction, or a fragile contract that is already hurting readability or change safety
   - acceptable tradeoff: the code is not ideal, but it is locally clear, stable in scope, and a rewrite would not clearly improve readability or change safety right now
   - future pressure point: the code is acceptable today but likely to become a problem if the surrounding feature grows

   Do not use `acceptable tradeoff` as a polite escape hatch for code that already hides responsibilities, protocols, state transitions, or abstraction boundaries.

7. Propose a sharper alternative.
   When you call out an issue, explain the cleaner shape of the code. Include a small rewrite only if it clarifies the recommendation.

8. Run a second-pass pressure check.
   Before finalizing, ask:
   - what would be hardest to change safely in three months?
   - what hidden invariant or protocol did I assume without proof?
   - did I label anything non-idiomatic without citing either repo precedent or language convention?
   - am I treating an inconsistent existing pattern as a rule when I should instead ask the user which style they want enforced?
   - if SRP-first mode applies, did I keep the review tightly focused on that instead of wandering into a broad audit?

## Review Checklist

Do not finalize the review until you can account for each item:

- reviewed the exact target the user asked about
- read enough adjacent context to understand local conventions
- checked house-style alignment, responsibilities, boundaries, control flow, naming, comments, and idioms
- answered the two primary questions: is it clear what this unit does, and is it doing just one thing
- if SRP problems exist, focused the review primarily on those problems
- distinguished fix-now issues from acceptable tradeoffs and future pressure points
- verified at least one repository or language convention before calling something non-idiomatic when the finding is not already grounded in the declared house style
- asked the user for direction when multiple valid styles would lead to materially different recommendations
- stated residual risks or missing context if confidence is limited

## Heuristics

### SRP

This is the highest-priority review dimension.

Start here before looking for secondary issues.

The key tests are:

- is it immediately clear what this unit does?
- is it doing just one thing?

If either answer is no, treat that as the main review outcome unless a more severe issue clearly dominates.

Flag code when one unit:

- validates, transforms, persists, and formats output in one place
- mixes domain logic with transport, UI, or storage concerns
- coordinates workflow while also owning low-level implementation details

Do not force indirection when a small function is already cohesive.

Apply the same reasoning above the function level:

- a file should usually have one clear reason to change
- a folder should usually represent one coherent resource, subsystem, or domain area
- repeated filename prefixes often indicate missing directory structure rather than good organization
- avoid splitting code into multiple files if those files do not earn distinct, nameable responsibilities
- when domain logic belongs to the server, prefer `src/server/models/<name>.ts` or a focused submodule such as `src/server/models/watchlist/import.ts`

When reporting SRP problems, prefer saying exactly which responsibilities are mixed and what the cleaner ownership boundary should be.

Good refactor directions include:

- keep orchestration in one place and move validation, formatting, persistence, or transport shaping to clearer boundaries
- merge files that were split without distinct responsibilities
- split a module only when each resulting module has a clear, nameable responsibility
- rename a unit when the current name hides the real responsibility

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

Also review structural complexity:

- too many small files with vague names can be harder to reason about than one cohesive module
- do not reward extra layers if the caller must still reconstruct the real workflow mentally
- flag files that exist only to bounce between `service`, `manager`, `runner`, `logic`, `operations`, or similarly generic layers
- flag domain behavior placed outside `src/server/models` when a model module would express the ownership more clearly

### Declarative Style

Prefer declarative code by default.

Good signals:

- data transformations are expressed as transformations
- repeated branching can become lookup tables, polymorphism, or dedicated helpers
- orchestration reads top-down without incidental mutation

Treat imperative bookkeeping as a design smell unless it is strictly required by the language or runtime boundary.

Do not excuse imperative code on the grounds of familiarity alone. Declarative code must still be judged against the rest of this skill's criteria: it should remain readable, cohesive, and simpler to reason about than the imperative alternative.

Do not blindly reward removing framework primitives if the replacement is a hand-rolled control loop that is harder to reason about. Judge the resulting shape, not the slogan. A no-effect rewrite that introduces a manual async state machine may still be a clean-code regression.

Prefer domain-oriented modules over action-oriented layer files. A resource or subsystem module with clear exported behavior is usually cleaner than scattering that behavior across generic service-style files.

### Readability

Flag:

- names that hide intent
- filenames or folder names that hide intent
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
- file or folder names that carry context through prefixes instead of structure
- generic filenames such as `service.ts`, `manager.ts`, `runner.ts`, `logic.ts`, or `types.ts` when a more precise domain name is available
- exported names that blur distinct concepts such as persistence, orchestration, resource lifecycle, UI state, or transport concerns
- overloaded terms like `status`, `job`, `result`, or `data` when the surrounding code has multiple competing meanings for them

Do not recommend extracting a helper or hook unless the new boundary has a clear, nameable responsibility and improves local reasoning for the caller.

When reviewing organization and naming:

- prefer resource- or domain-based files/folders over action-based prefixes
- prefer a parent directory over repeating the same long prefix across many filenames
- expect a module's public API to read like the domain it models
- extracted subordinate modules should name real concerns, traits, or adapters, not generic implementation buckets
- if one module can clearly express the resource API on its own, prefer that over preemptive splitting
- prefer server-side domain modules in `src/server/models` with explicit resource filenames so ownership stays obvious without relying on `index` files

Rails-inspired concern/module guidance applies even outside Rails and even when using plain JS/TS modules:

- keep the public API centered on the resource or domain concept
- split supporting code only when it captures a real concern of that resource
- do not create modules just to distribute line count
- concerns should enhance readability of the main module, not replace it with indirection

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

Apply the house style first. Then use the language and repository to refine the judgment and avoid false positives.

If the repository is inconsistent because of legacy code, generated code, or vibe-coded drift, do not assume the most common existing pattern is the desired one.

Infer the standard from the language and repository when the house style does not already decide the issue:

- TypeScript/JavaScript: clear function boundaries, explicit naming, avoid needless mutation, match project async/error patterns
- React: derive UI where possible, avoid overstuffed components, keep hooks and side effects disciplined
- Go: simple control flow, small focused functions, conventional error handling, avoid framework-style abstraction creep
- Python: readable over clever, leverage standard idioms, keep data flow explicit
- Rust: model invariants in types, keep ownership/error boundaries clear, avoid obscuring control flow

If the repository already follows a stronger local convention than the language default, prefer the repository convention.

Also infer organization conventions from the repository:

- if the codebase is resource-oriented, prefer adding behavior to the resource module before creating a new layer file
- if directories already group cohesive subsystems, prefer extending that structure instead of reintroducing prefixes
- do not force "clean architecture" layers into a codebase that is otherwise organized around domain modules unless the payoff is clear

For this codebase, treat `src/server/models` as the preferred home for server-side domain logic unless the code clearly belongs to another boundary such as transport, rendering, or infrastructure.

When calling out a convention mismatch, name the convention source explicitly:

- repository precedent: cite the nearby module, folder pattern, or established naming shape
- language convention: cite the relevant language or framework norm

Do not present personal taste as a convention claim. If a judgment comes from the house style in this file, label it that way.

If two or more options are genuinely reasonable and the skill cannot infer the intended direction with confidence, ask the user instead of forcing a verdict.

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

Start with a brief review header:

- scope reviewed
- additional context reviewed
- conventions observed
- confidence or missing context if relevant
- whether SRP-first mode is active

Then organize the report by analyzed file or target unit, not by priority bucket.

- Use one section per file when multiple files were reviewed.
- If the review target is a single function, hook, class, or snippet, use that target as the section heading.
- Within each file or target section, list findings in the order that best supports reading the code, usually top-to-bottom through the source.
- Do not group the entire review into global severity sections like `Fix now`, `Critical`, `Suggestions`, or `Nits`.

Within each finding, use this structure:

- location
- classification: `house-style violation`, `maintainability risk`, `acceptable outside this codebase but not in this style`, or another precise label when needed
- what
- why it matters
- how to fix it
- recommendation level: `fix now`, `acceptable tradeoff`, or `future pressure point`

When SRP-first mode is active:

- lead with the SRP findings only
- keep non-SRP findings out unless they are tightly coupled to the same responsibility problem
- make the preferred responsibility boundary explicit
- optimize for helping the user decide the first refactor, not for exhausting every possible critique

Prefer a report shape like this:

```md
## Review Scope

- Scope reviewed: ...
- Additional context: ...
- Conventions observed: ...

## `src/foo.ts`

### Finding 1

- Location: `src/foo.ts:42`
- Classification: `house-style violation`
- What: This function mixes validation, persistence, and response shaping.
- Why it matters: It has multiple reasons to change and forces the reader to hold unrelated concerns in mind.
- How to fix it: Keep this function focused on orchestration, then move validation and response formatting into named helpers or domain-level functions.
- Recommendation level: `fix now`

### Finding 2

- Location: `src/foo.ts:88`
- What: ...
- Why it matters: ...
- How to fix it: ...
- Recommendation level: `future pressure point`
```

Add a short `What is already working well` subsection inside each file section when it helps the user understand which existing choices should be preserved.

Use markdown headings consistently:

- `## Review Scope`
- `## <file or target>` for each analyzed file, function, hook, class, or snippet
- `### Finding 1`, `### Finding 2`, and so on within each file or target section
- `### What is already working well` when present

Do not compress the report into a single paragraph unless the user explicitly asked for a terse answer.

When there is only one meaningful finding, still use the full structure instead of collapsing it into prose.

When there are no meaningful findings, organize the response by reviewed file and state clearly what passed review in that file.

Do not omit `what`, `why`, or `how to fix it` just to be brief.

Number findings within each file or target section in source order unless a different order is clearly easier to follow.

End the report with a short overall risk line when useful, for example:

- `Overall risk: low; the code is readable today, but state modeling will become harder to extend.`
- `Overall risk: medium; the current design works, but one function is accumulating unrelated responsibilities.`

After the file sections, include:

- open questions or assumptions
- a short summary only if useful

If there are no meaningful findings, say so explicitly and still include:

- scope reviewed
- additional context reviewed
- conventions checked
- the highest-signal residual risk or uncertainty

When there are no meaningful findings, do not invent stylistic filler. State clearly that the code is in good shape, then mention only the highest-signal residual risk if one exists.

## Tone

Be direct and specific. Avoid vague statements like "could be cleaner" or "consider refactoring" without naming the actual problem.

Write as an opinionated reviewer, not a neutral style catalog. If something violates the house style, say so plainly.

When SRP-first mode is active, be even stricter about focus: one sharp review is better than a broad mixed list.

Prefer:

- "This function mixes validation, persistence, and response shaping, which gives it multiple reasons to change."
- "This branching structure forces the reader to track four states at once."
- "This is an acceptable pattern in some codebases, but it violates the house style here because the abstraction does not earn its boundary."
- "This is the wrong abstraction boundary for this codebase."

Avoid:

- generic clean code slogans
- "consider refactoring"
- "this may be cleaner"
- "it depends" without naming the deciding factor
- hiding stylistic nitpicks just because they are small; surface them clearly as lower-severity findings when relevant
- recommending abstractions with no clear payoff
- treating every non-ideal shape as equally urgent
- praising a refactor just because it removed a framework primitive while making the resulting control flow harder to understand
- praising code just because it is split into smaller files or extracted into more helpers

Style nitpicks are allowed and should come through in the review when they reflect established conventions, readability improvements, or consistency concerns. Mark them as low severity or nits where appropriate and leave implementation priority to the user.

Do not hedge away the conclusion. Name the problem, name why it violates the style, and point to the preferred shape.
