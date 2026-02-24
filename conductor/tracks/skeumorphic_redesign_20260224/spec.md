# Specification: Watchlists Index Skeumorphic Redesign

## Overview

Redesign the watchlists index page (`/`) to transition from a standard grid/list view to a highly aesthetic, skeumorphic "High Tech / Glass" interface. The new design will utilize physical metaphors, depth, and tactile feedback to create a premium, "living" library experience.

## Functional Requirements

- **Physical Shelf/Stack Layout:** Replace the current grid with a layout that visually represents watchlists as a stack of physical cards or items on a high-tech shelf.
- **Skeumorphic Card Design:** Each watchlist item should be styled as a "glass" card with realistic depth, soft shadows, and inner glows.
- **Tactile Interactions:**
  - Hovering over a card should trigger a "lift" effect.
  - Clicking/Tapping should show a visible "pressed" depth.
  - Transitions between states or navigating into a watchlist should be fluid and physics-based.
- **High Tech / Glass Aesthetic:** Use semi-transparent glass textures (glassmorphism) with high-contrast accents and metallic/neon-glow highlights.
- **Object Metaphors:** Use metaphors such as cards, folders, or "glowing chips" to represent watchlists.

## Non-Functional Requirements

- **Performance:** Ensure that complex shadows and glass filters (backdrop-blur) do not degrade performance on mobile devices (PWA focus).
- **Accessibility:** Maintain high contrast for text and clear visual indicators for interactive elements despite the complex styling.

## Acceptance Criteria

- Watchlists index page is fully redesigned with the new glass/skeumorphic style.
- Hover lift and pressed state animations are functional and smooth.
- The "Physical Shelf/Stack" layout correctly displays all user watchlists.
- Mobile performance remains fluid (60fps transitions).

## Out of Scope

- Redesigning the individual watchlist detail pages (this track is focused on the index only).
- Changing the underlying data fetching or logic for watchlists.
