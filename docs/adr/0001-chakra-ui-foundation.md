# ADR 0001: Use Chakra UI As The Shared UI Foundation

- Status: Accepted
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

Migration slices may temporarily coexist with the legacy Tailwind and Sonner
surfaces. Sonner remains mounted for unmigrated publishers while Chakra's
toaster is available to migrated surfaces. Lucide remains the icon-library
exception.

## Consequences

Chakra reduces the application-owned component and utility-styling surface and
provides a maintained API boundary for shared UI. The initial foundation does
not remove legacy dependencies; later migration slices must replace active
consumers before the old styling system is removed. Chakra's preflight is
disabled during coexistence so unmigrated components retain their behavior.
