---
name: srp-review
description: Perform thorough reviews for Single Responsibility Principle (SRP) adherence and top-down readability. Use when auditing files, classes, modules, or methods for cohesion, or when improving code legibility and architectural clarity.
---

# SRP & Top-Down Review

This skill provides a systematic approach to reviewing code for the Single Responsibility Principle (SRP) and ensure it follows the "Stepdown Rule" for top-down readability.

## Quick Start

To start a review, provide a file path or a symbol name. The skill will:

1. Define the core responsibility of the unit.
2. Check for "mixed levels of abstraction".
3. Identify co-located concerns that violate SRP.
4. Suggest a refactored structure.

## Workflows

### 1. Identify the Single Responsibility

A module or class should have one, and only one, reason to change.

- **Check**: Can you describe what this unit does without using "and"?
- **Check**: Are there parts of the code that change for different reasons (e.g., business logic vs. persistence vs. UI formatting)?

### 2. Audit Top-Down Readability (The Stepdown Rule)

Code should read like a narrative from top to bottom.

- **Check**: Are high-level entry points at the top of the file/class?
- **Check**: Does every function call lead to a function defined below it that represents a lower level of abstraction?
- **Check**: Are implementation details hidden behind well-named private methods or helper functions?

### 3. Detect Mixed Levels of Abstraction

Mixing high-level logic (e.g., `calculateTotal()`) with low-level details (e.g., `db.query("SELECT...")`) in the same method is a violation of both legibility and SRP.

- **Check**: Does each method operate at a single level of abstraction?

### 4. Provide the Refactor Plan

For each violation found:

1. **Highlight**: Point out the specific lines or blocks.
2. **Rationalize**: Explain why it violates SRP or hinders readability.
3. **Propose**: Show a structural sketch of the refactored code.

### 5. Verify Before Claiming

When auditing a file, do not assume things that can be verified by reading the code. Before claiming a value, type, or behavior is null, default, optional, or absent — look it up. Check the schema, the type definition, or the surrounding code. If you cannot verify it from the code under review or adjacent files (e.g., DB schema, shared types), mark it as a hypothesis and state it explicitly rather than presenting it as fact.

## References

- **SRP**: A class should have one reason to change (Uncle Bob).
- **Stepdown Rule**: We want to read the code as though it were a set of TO paragraphs, each of which is describing the current level of abstraction and referencing subsequent TO paragraphs at the next level down.
