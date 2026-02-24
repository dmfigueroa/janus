# Implementation Plan: Watchlists Index Skeumorphic Redesign

## Phase 1: Design System & Primitives

- [ ] Task: Define Skeumorphic Design Tokens
  - [ ] Add glassmorphism shadows and gradients to Tailwind/CSS variables.
  - [ ] Define tactile "pressed" state utility classes.
- [ ] Task: Develop `GlassCard` Component
  - [ ] [TDD] Write failing tests for `GlassCard` (visual props, children rendering).
  - [ ] [TDD] Implement `GlassCard` with backdrop-blur and inner-glow.
- [ ] Task: Develop `TactileButton` Component
  - [ ] [TDD] Write failing tests for `TactileButton` (active states, click feedback).
  - [ ] [TDD] Implement `TactileButton` with physical press animation.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Design System & Primitives' (Protocol in workflow.md)

## Phase 2: Index Page Layout

- [ ] Task: Design "Physical Shelf" Container
  - [ ] Create `WatchlistShelf` component to manage the stack/grid layout.
  - [ ] Implement responsive stacking logic (perspective/overlap).
- [ ] Task: Implement `WatchlistCard` Redesign
  - [ ] [TDD] Write failing tests for the new `WatchlistCard` (data binding, interaction triggers).
  - [ ] [TDD] Implement the redesigned card using `GlassCard` and `TactileButton`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Index Page Layout' (Protocol in workflow.md)

## Phase 3: Animations & Motion

- [ ] Task: Implement Hover Lift & Fluid Motion
  - [ ] Add Framer Motion (or CSS) transitions for card entry and hover.
  - [ ] Ensure smooth 60fps performance on mobile.
- [ ] Task: Refine Navigation Transitions
  - [ ] Add exit/enter animations when moving from index to a specific watchlist.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Animations & Motion' (Protocol in workflow.md)

## Phase 4: Final Integration & QA

- [ ] Task: Data Integration & Edge Cases
  - [ ] Connect the shelf to the actual watchlist data.
  - [ ] Style the "Create Watchlist" card/button to match the new aesthetic.
- [ ] Task: Performance & Accessibility Audit
  - [ ] Verify backdrop-blur performance on mobile Safari/Chrome.
  - [ ] Ensure color contrast and screen reader support.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Integration & QA' (Protocol in workflow.md)
