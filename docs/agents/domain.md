# Domain Docs

Janus is a single-context repository. Before exploring the codebase or proposing changes, read:

- **[`CONTEXT.md`](../../CONTEXT.md)** at the repository root for domain vocabulary.
- **[`docs/adr/`](../adr/)** for architecture decisions touching the area you are working in (for example, `0001-chakra-ui-foundation.md` for v1 UI and `0002-rust-v2.md` for the Rust v2 rewrite).

## Use the glossary's vocabulary

When naming domain concepts in issues, proposals, tests, or code, use the terms defined in `CONTEXT.md` and avoid the synonyms it explicitly rejects. If a needed concept is missing, note the gap for `/domain-modeling` rather than inventing ad-hoc terminology.

## Flag ADR conflicts

If a proposal contradicts an accepted ADR, call it out explicitly instead of silently overriding it:

> _Contradicts ADR-0002 (Rust v2), but worth reopening because…_
