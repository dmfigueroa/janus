---
name: Janus
version: 1.0.0
description: A media watchlist tracker with vibrant pink accents on deep purple-dark surfaces

# Color Palette
colors:
  primary:
    - name: Vibrant Pink
      hex: '#FF0055'
      hsl: 'hsl(340 100% 50%)'
      role: Primary actions, active states, progress indicators, accent glows
    - name: White
      hex: '#FFFFFF'
      role: Primary foreground on pink elements

  background:
    light:
      - name: Pure White
        hex: '#FFFFFF'
        role: Page background (light mode)
    dark:
      - name: Deep Purple-Black
        hex: '#141218'
        hsl: 'hsl(260 20% 8%)'
        role: Page background (dark mode default)

  card:
    light:
      - name: Pure White
        hex: '#FFFFFF'
        role: Card surfaces (light mode)
    dark:
      - name: Muted Purple-Grey
        hex: '#201D25'
        hsl: 'hsl(260 14% 13%)'
        role: Card surfaces (dark mode)

  secondary:
    light:
      - name: Light Grey
        hex: '#F5F5F4'
        hsl: 'hsl(260 10% 96%)'
        role: Secondary backgrounds, inputs (light mode)
    dark:
      - name: Deep Muted Purple
        hex: '#28242E'
        hsl: 'hsl(260 15% 18%)'
        role: Secondary backgrounds, inputs (dark mode)

  muted:
    foreground:
      light:
        - name: Medium Grey
          hex: '#737373'
          hsl: 'hsl(260 5% 45%)'
          role: Secondary text, placeholders (light mode)
      dark:
        - name: Light Purple-Grey
          hex: '#A8A4AF'
          hsl: 'hsl(260 10% 65%)'
          role: Secondary text, placeholders (dark mode)

  accent:
    - name: Light Grey (light) / Deep Muted Purple (dark)
      hex: '#F5F5F4' / '#28242E'
      role: Hover states, subtle backgrounds

  destructive:
    - name: Soft Red
      hex: '#DC2626'
      hsl: 'hsl(0 85% 60%)'
      role: Destructive actions, error states

  border:
    light:
      - name: Light Grey Border
        hex: '#E5E5E5'
        hsl: 'hsl(260 10% 90%)'
        role: Borders, dividers (light mode)
    dark:
      - name: Muted Purple Border
        hex: '#28242E'
        hsl: 'hsl(260 15% 18%)'
        role: Borders, dividers (dark mode)

  foreground:
    light:
      - name: Near Black
        hex: '#1A1A1A'
        hsl: 'hsl(260 20% 10%)'
        role: Primary text (light mode)
    dark:
      - name: Off White
        hex: '#FAFAFA'
        hsl: 'hsl(0 0% 98%)'
        role: Primary text (dark mode)

# Typography
font:
  family:
    - name: Inter
      stack: 'Inter, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji'
      role: All text throughout the application

  scale:
    - name: Display/Headers
      weight: 800 (Extrabold)
      size: 1.875rem (30px)
      tracking: tight (-0.05em)
      role: Page titles, section headers

    - name: Card Titles
      weight: 700 (Bold)
      size: 1.125rem (18px)
      tracking: tight (-0.025em)
      role: Watchlist names, card headers

    - name: Body/Labels
      weight: 500 (Medium)
      size: 0.875rem (14px)
      tracking: normal
      role: General text, labels

    - name: Small/Caption
      weight: 500 (Medium)
      size: 0.75rem (12px)
      tracking: 0.05em
      role: Metadata, timestamps, small labels

# Spacing System
spacing:
  base: 4px
  unit: 0.25rem (4px)
  scale:
    - 1 (4px) - Tight gaps, icon padding
    - 2 (8px) - Small element spacing
    - 3 (12px) - Input padding
    - 4 (16px) - Standard padding
    - 6 (24px) - Section margins, page padding
    - 8 (32px) - Large section gaps

# Radii (Border Radius)
radii:
  base: 16px (1rem)
  scale:
    - name: Pill
      value: full
      description: Circular buttons, avatar indicators
    - name: Large
      value: 16px
      description: Cards, dialogs, sheets (--radius-lg)
    - name: Medium
      value: 14px
      description: Buttons, inputs (--radius-md = base - 2px)
    - name: Small
      value: 12px
      description: Small buttons, tags (--radius-sm = base - 4px)
    - name: Watchlist Cards
      value: 18px (rounded-2xl)
      description: Cover image cards with 2:3 aspect ratio

# Shadows
shadows:
  - name: Card Shadow
    value: shadow-2xl
    description: Elevated cards with strong depth
  - name: Dialog Shadow
    value: shadow-lg
    description: Modal overlays, sheet panels
  - name: Button Shadow
    value: shadow-sm
    description: Subtle elevation for buttons
  - name: None
    value: shadow-none
    description: Inputs, flat elements

# Elevation & Depth
elevation:
  - level: 1 (Base)
    bg: Card background with shadow-2xl
    description: Watchlist cards, main content containers
  - level: 2 (Overlay)
    bg: bg-black/80 backdrop-blur
    description: Dialog overlays, sheet backdrops
  - level: 3 (Navigation)
    bg: background/90 with backdrop-blur-md
    description: Fixed bottom navigation bar
  - level: 4 (Active)
    bg: ring-primary
    description: Selection states, active indicators

# Motion & Animation
motion:
  duration:
    fast: 150ms - Icon transitions, button hovers
    normal: 200ms - Accordion animations, fade transitions
    slow: 300-500ms - Card transforms, sheet slides

  easing:
    default: ease-out
    spring: ease-in-out (for sheets and drawers)

  animations:
    - name: Accordion
      type: height collapse
      duration: 200ms
      easing: ease-out
    - name: Dialog/Sheet Fade
      type: opacity crossfade
      duration: 200ms
    - name: Dialog Zoom
      type: scale 0.95 → 1
      duration: 200ms
    - name: Card Hover Scale
      type: scale transform
      duration: 300ms
      values: scale-[1.02] on hover, scale-[0.98] on press
    - name: Selection Ring
      type: ring-4 with ring-primary
      description: Blue selection state on watchlist cards

  ambient:
    - name: Active Tab Glow
      effect: drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]
      description: Bottom nav active icon with pink glow
    - name: Cover Image Blur
      effect: blur-2xl scale-150
      description: Episode thumbnail background with heavy blur

# Component Patterns

## Buttons
- Shape: Rounded-md (12px) for standard, rounded-full for icon buttons
- Padding: h-9 px-4 py-2 (default), h-8 px-3 (small), h-10 px-8 (large)
- Shadow: shadow-sm for default/outline/secondary variants
- Primary: bg-primary with white text, hover opacity 0.9
- Ghost: No background, hover:bg-accent
- Icon: h-9 w-9 square with rounded-full appearance
- Ring: focus-visible:ring-1 with primary color

## Cards (Watchlist)
- Shape: Rounded-2xl (18px) corners
- Aspect: 2:3 (vertical poster format)
- Shadow: shadow-2xl for depth
- Border: border-none (no visible border)
- Content: Cover image fills card with gradient overlay
- Info: Below-card layout with bold title, muted metadata

## Inputs
- Shape: Rounded-md with 9px height
- Border: border border-input (same as secondary)
- Background: Transparent
- Padding: px-3 py-1
- Focus: ring-1 with primary color, 50% opacity
- Placeholder: text-muted-foreground

## Dialogs/Sheets
- Border: border with border color
- Background: bg-background
- Shadow: shadow-lg
- Animation: Fade + zoom for dialogs, slide for sheets
- Overlay: bg-black/80 with backdrop blur
- Close button: Absolute positioned top-right

## Navigation
- Bottom nav: Fixed, backdrop-blur-md, border-t
- Active state: text-primary with subtle glow effect
- Inactive: text-muted-foreground with hover state
- Safe area: pb-[env(safe-area-inset-bottom)]

# Glass Effects
glass:
  - name: Glass Utility
    class: glass
    styles: bg-black/5 border-black/10 dark:bg-white/5 dark:border-white/10 backdrop-blur-lg border
    description: Frosted glass effect for overlays

# Chart Colors (for potential data visualization)
chart:
  - '#FF0055' (Primary pink)
  - '#A8A4AF' (Muted purple-grey)
  - '#28242E' (Secondary)
  - '#141218' (Deep background)
  - '#FAFAFA' (Foreground white)
---

# Design System: Janus

## 1. Visual Theme & Atmosphere

**Premium Minimal with Vibrant Pink Accents**

Janus presents a clean, cinema-inspired interface that works equally well in light and dark contexts. In **light mode**, the palette is bright and premium — pure white surfaces with near-black text create crisp contrast, while in **dark mode**, deep purple-black backgrounds evoke a sophisticated streaming service atmosphere. Either way, a single vibrant pink accent (#FF0055) punctuates key interaction points: primary actions, active states, progress indicators, and selection rings.

The overall feel is **scannable yet tactile** — poster-ratio watchlist cards have strong presence with generous shadow and smooth hover transforms. Motion is restrained but purposeful: cards scale on hover, active navigation glows softly, and overlays animate with smooth fade-zoom transitions.

The mobile-first layout prioritizes browsing a personal media collection. Touch targets meet 44px minimums, bottom navigation stays fixed with safe-area handling, and content breathes with generous padding even on larger screens.

## 2. Color Palette & Roles

| Color Name            | Light Mode | Dark Mode | Functional Role                                                          |
| --------------------- | ---------- | --------- | ------------------------------------------------------------------------ |
| **Vibrant Pink**      | #FF0055    | #FF0055   | Primary actions, active states, progress bars, selection rings, tab glow |
| **Deep Purple-Black** | #FFFFFF    | #141218   | Page background, creates the dark cinema atmosphere                      |
| **Muted Purple-Grey** | #FFFFFF    | #201D25   | Card surfaces, elevated containers                                       |
| **Secondary Surface** | #F5F5F4    | #28242E   | Input backgrounds, secondary buttons, hover states                       |
| **Medium Grey**       | #737373    | #A8A4AF   | Secondary text, placeholders, metadata                                   |
| **Near Black**        | #1A1A1A    | #FAFAFA   | Primary text (inverted for contrast)                                     |
| **Soft Red**          | #DC2626    | #DC2626   | Destructive actions, error states                                        |
| **Subtle Border**     | #E5E5E5    | #28242E   | Dividers, input borders                                                  |

## 3. Typography Rules

**Font Family:** Inter — clean, highly legible, excellent for UI

**Weight Distribution:**

- **Extrabold (800):** Page titles, section headers — creates strong visual anchors
- **Bold (700):** Card titles, dialog headers — clear hierarchy within content
- **Medium (500):** Body text, labels, navigation — comfortable for extended reading

**Tracking:**

- Tight (-0.05em): Display headers for visual impact
- Slightly tight (-0.025em): Card titles for elegance
- Normal: Body text for readability
- Wide (+0.05em): Small labels and metadata for subtle emphasis

## 4. Component Stylings

### Buttons

- **Shape:** Rounded-md corners (14px), icon buttons become circular (rounded-full)
- **Primary:** Vibrant pink background (#FF0055) with white text, shadow-sm, hover dims to 90% opacity
- **Secondary:** Secondary background color with secondary-foreground text
- **Ghost:** No background, subtle accent background on hover
- **Destructive:** Soft red background for dangerous actions
- **Focus:** 1px primary-colored ring for accessibility

### Cards / Containers

- **Watchlist Cards:** Pill-like rounded-2xl corners (18px), 2:3 aspect ratio (portrait poster style), shadow-2xl for floating elevation, no visible border
- **Content Overlay:** Semi-transparent gradient from black/60 at bottom for text legibility over cover images
- **Selection State:** 4px primary-colored ring around selected cards
- **Hover:** Subtle scale-up (1.02) with 300ms ease transition
- **Active/Press:** Scale-down (0.98) for tactile feedback

### Inputs / Forms

- **Shape:** Rounded-md with 36px height (h-9)
- **Background:** Transparent with border-input
- **Search Bar Variant:** Larger (h-12), rounded-2xl, bg-card background — feels more prominent and touchable
- **Focus State:** Primary-colored ring at 50% opacity
- **Placeholder:** Muted foreground color

### Dialogs & Sheets

- **Overlay:** Black at 80% opacity with backdrop blur creates focus on content
- **Content:** Rounded-lg corners, bg-background, shadow-lg
- **Animation:** Fade + scale (95% → 100%) for dialogs, slide-in from edges for sheets
- **Close Button:** Absolute positioned, icon-only with opacity hover states

### Navigation

- **Bottom Nav Bar:** Fixed position, backdrop-blur-md, top border, safe-area insets for mobile
- **Nav Items:** Vertical stack with icon + label, active state shows primary color with subtle pink glow effect
- **Inactive State:** Muted foreground with hover brightening

## 5. Layout Principles

### Spatial System

- **Base unit:** 4px (0.25rem in Tailwind)
- **Standard padding:** 24px (6 units) for page content
- **Card gaps:** 16px in compact grids, 24px in relaxed layouts
- **Section spacing:** 32px between major content blocks

### Grid Strategy

- **Mobile (< 640px):** 2-column grid for watchlist cards, full width
- **Tablet/Desktop (≥ 640px):** Flexible grid with 220px minimum card width
- **Maximum content width:** mx-auto with max-w-md for focused reading

### Responsive Behavior

- Touch targets minimum 44px
- Cards scale proportionally
- Bottom navigation fixed with safe-area handling for notched devices
- Generous padding prevents content from feeling cramped on larger screens

## 6. Motion Philosophy

**Principle: Motion should feel natural and non-distracting**

- **Micro-interactions:** 150ms for hovers and icon transitions — fast enough to feel instant
- **State changes:** 200ms for fades and accordions — visible but not slow
- **Layout shifts:** 300-500ms for cards and sheets — allows user to track the motion
- **Easing:** ease-out for most transitions, ease-in-out for sheets and drawers

**Signature Effects:**

1. **Active tab glow:** Soft pink drop-shadow radiates from selected navigation icon
2. **Card hover:** Subtle lift with scale transform (1.02x)
3. **Selection ring:** Primary-colored ring animates onto selected cards
4. **Cover image parallax:** Episode thumbnails use heavy blur + scale as background effect

## 7. Accessibility Considerations

- All interactive elements have visible focus states (ring-1 primary)
- Sufficient color contrast between foreground/background pairs
- Touch targets meet 44px minimum
- Screen reader text labels on icon-only buttons
- Respects reduced-motion preferences
