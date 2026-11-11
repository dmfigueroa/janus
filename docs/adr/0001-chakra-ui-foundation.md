# ADR 0001: Use Chakra UI As The Shared UI Foundation

- Status: Accepted for v1; superseded for v2 by [ADR 0002: Rust v2](0002-rust-v2.md)
- Date: 2026-08-20

## Context

Janus's shared UI was spread across generated shadcn components, Tailwind
utility classes, Radix compositions, and several supporting component
libraries. That surface made routine agent and contributor changes prone to
visual drift and incidental regressions. Theme values were also divided
between runtime CSS, design documentation, and PWA metadata.

## Decision

Adopt Chakra UI 3 as Janus's shared component and theming foundation. The
application provider owns the Janus color, typography, spacing, radius,
elevation, motion, focus, and glass-effect vocabulary. Chakra uses
`next-themes` in system mode so users continue to follow the operating-system
preference without a theme selector.

Chakra is now the only application component library and the Chakra toaster is
the sole notification boundary. Lucide remains the icon-library exception.

## Consequences

Chakra reduces the application-owned component and utility-styling surface and
provides a maintained API boundary for shared UI. The completed migration
removes the legacy generated primitives, utility styling, and notification
adapter, leaving Chakra's preflight and semantic theme tokens authoritative.
