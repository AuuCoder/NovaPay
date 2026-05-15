# NovaPay Plugin Registry — Design System

Based on the Wise-inspired design language from [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/wise/DESIGN.md).

## Overview

The Registry UI adopts a calm fintech aesthetic: a single vivid lime-green accent for primary CTAs, sage-tinted canvas backgrounds, generous 24px rounded cards, and a two-face typography system (heavy display + neutral body). The result reads like a Scandinavian developer portal — friendly, spacious, and confident.

## Colors

### Brand & Accent

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#9fe870` | Primary CTA buttons, brand accent, active indicators |
| `--color-primary-hover` | `#cdffad` | Primary button hover/active state |
| `--color-primary-neutral` | `#c5edab` | Mid-saturation green for neutral active fills |
| `--color-primary-pale` | `#e2f6d5` | Soft green for badge backgrounds, subtle tints |

### Surface

| Token | Value | Usage |
|-------|-------|-------|
| `--color-canvas` | `#ffffff` | Card interiors, modal backgrounds |
| `--color-canvas-soft` | `#e8ebe6` | Page background, hero bands, sage-tinted surfaces |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--color-ink` | `#0e0f0c` | Primary text, headings (near-black with olive warmth) |
| `--color-ink-deep` | `#163300` | Text on positive-state surfaces |
| `--color-body` | `#454745` | Secondary body text |
| `--color-mute` | `#868685` | Captions, placeholders, fine print |

### Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--color-positive` | `#2ead4b` | Success states |
| `--color-positive-deep` | `#054d28` | Pressed positive |
| `--color-warning` | `#ffd11a` | Caution indicators |
| `--color-warning-content` | `#4a3b1c` | Text on warning surfaces |
| `--color-negative` | `#d03238` | Error / destructive actions |
| `--color-negative-deep` | `#a72027` | Pressed destructive |

### On-Primary

| Token | Value | Usage |
|-------|-------|-------|
| `--color-on-primary` | `#0e0f0c` | Text on primary green buttons (dark ink for contrast) |

## Typography

### Font Stack

- **Display**: `Inter` weight 800–900 (substitute for proprietary Wise Sans)
- **Body**: `Inter` weight 400–600
- Load with `font-feature-settings: "calt"` for contextual alternates.

### Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `display-xl` | 64px | 900 | 1.05 | Hero headlines |
| `display-md` | 40px | 900 | 1.1 | Section headlines |
| `display-sm` | 32px | 600 | 1.2 | Sub-section headings |
| `display-xs` | 24px | 600 | 1.3 | Card titles |
| `body-lg` | 20px | 400 | 1.5 | Lead paragraphs |
| `body-md` | 16px | 400 | 1.5 | Default body |
| `body-md-strong` | 16px | 600 | 1.5 | Bold inline body |
| `body-sm` | 14px | 400 | 1.43 | Secondary body, table cells |
| `body-sm-strong` | 14px | 600 | 1.43 | Nav links, bold captions |
| `caption` | 12px | 400 | 1.33 | Fine print, timestamps |
| `button-md` | 16px | 600 | 1.5 | Button labels |

## Spacing

Base unit: 4px.

| Token | Value |
|-------|-------|
| `--space-xxs` | 2px |
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 12px |
| `--space-lg` | 16px |
| `--space-xl` | 24px |
| `--space-2xl` | 32px |
| `--space-3xl` | 48px |

- Section padding: `--space-3xl` (48px) top/bottom on desktop
- Card interior padding: `--space-xl` (24px)

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--rounded-none` | 0px | Full-bleed bands |
| `--rounded-sm` | 8px | Inline pills, small badges |
| `--rounded-md` | 12px | Form inputs |
| `--rounded-lg` | 16px | Mid-size cards |
| `--rounded-xl` | 24px | **Canonical card + button radius** |
| `--rounded-pill` | 9999px | Status pills |
| `--rounded-full` | 9999px | Circular icons |

## Elevation

The system uses **surface contrast** as the primary elevation cue (sage background vs white cards), not shadows.

| Level | Treatment | Usage |
|-------|-----------|-------|
| 0 — Flat | No shadow, no border | Default |
| 1 — Hairline | 1px solid `--color-ink` border | Outline buttons, form inputs |
| 2 — Soft Card | White card on sage canvas (contrast IS elevation) | Content cards |

## Components

### Buttons

**Primary** (`button-primary`)
- Background: `--color-primary`
- Text: `--color-on-primary`
- Font: `button-md` (16px/600)
- Padding: `--space-md` `--space-xl` (12px 24px)
- Radius: `--rounded-xl` (24px)
- Hover: `--color-primary-hover`

**Secondary** (`button-secondary`)
- Background: `--color-canvas-soft`
- Text: `--color-ink`
- Same typography/padding/radius as primary

**Tertiary** (`button-tertiary`)
- Background: `--color-canvas`
- Text: `--color-ink`
- Border: 1px solid `--color-ink`
- Same typography/padding/radius

### Cards

**Content Card** (`card-content`)
- Background: `--color-canvas`
- Padding: `--space-xl` (24px)
- Radius: `--rounded-xl` (24px)
- No border — sits on sage canvas for contrast

**Feature Card — Sage** (`card-feature-sage`)
- Background: `--color-canvas-soft`
- Padding: `--space-xl`
- Radius: `--rounded-xl`

**Feature Card — Green** (`card-feature-green`)
- Background: `--color-primary-pale`
- Padding: `--space-xl`
- Radius: `--rounded-xl`

**Feature Card — Dark** (`card-feature-dark`)
- Background: `--color-ink`
- Text: `--color-primary` (green on dark!)
- Padding: `--space-xl`
- Radius: `--rounded-xl`

### Inputs

**Text Input** (`text-input`)
- Background: `--color-canvas`
- Text: `--color-ink`
- Border: 1px solid `--color-ink`
- Font: `body-md`
- Padding: `--space-md` `--space-lg` (12px 16px)
- Radius: `--rounded-md` (12px)
- Focus: border-color `--color-primary`, ring 2px `--color-primary-pale`

### Navigation

**Top Nav** (`nav-bar`)
- Background: `--color-canvas`
- Text: `--color-ink`
- Padding: `--space-md` `--space-xl`
- Sticky top

**Nav Link** (`nav-link`)
- Font: `body-sm-strong`
- Color: `--color-ink`
- Active indicator: `--color-primary` underline or left-border

### Status Badges

**Positive Badge**
- Background: `--color-primary-pale`
- Text: `--color-positive-deep`
- Font: `body-sm-strong`
- Padding: `--space-xs` `--space-md`
- Radius: `--rounded-pill`

**Negative Badge**
- Background: `--color-negative` at 10% opacity
- Text: `--color-negative-deep`
- Same structure

**Neutral Badge**
- Background: `--color-canvas-soft`
- Text: `--color-body`
- Same structure

### Tables

**Data Table**
- Header: `caption` font, uppercase tracking, `--color-mute` text, `--color-canvas-soft` background
- Body: `body-sm`, `--color-ink` text
- Row border: 1px solid `--color-canvas-soft`
- Cell padding: `--space-md` `--space-lg`

## Layout Principles

### Grid
- Container max-width: 1200px, centered
- Desktop: 12-column grid
- Tablet (768–1023px): 2-up grids
- Mobile (<768px): single column stack

### Page Structure
- Hero band: `--color-canvas-soft` background, `--space-3xl` padding
- Content sections: `--color-canvas` background, white cards
- Footer: `--color-ink` background, `--color-canvas-soft` text

### Responsive
- Breakpoints: 768px (tablet), 1024px (desktop)
- Touch targets: minimum 48px height
- Cards stack vertically on mobile

## Do's and Don'ts

### Do
- Use `--color-primary` (lime green) exclusively for primary CTAs
- Use `--rounded-xl` (24px) for all cards and buttons
- Alternate sage canvas → white cards for visual rhythm
- Keep display headings at weight 800–900
- Use surface contrast (sage vs white) as the primary depth cue

### Don't
- Don't introduce a second brand accent color
- Don't use sharp corners on interactive elements
- Don't render CTAs lighter than weight 600
- Don't place green buttons on green backgrounds
- Don't use shadows as the primary elevation mechanism

## Application to Registry Pages

### Developer Portal
- Auth pages: centered `card-content` on sage canvas, green primary CTA
- Plugin list: `card-content` grid on sage, each card shows plugin name + version + status badge
- Upload flow: stepped form inside `card-content`, progress indicator uses `--color-primary`
- Sales dashboard: data tables with sage header rows, green accent for positive metrics

### Admin Console
- Review queue: table layout with status badges (SUBMITTED=neutral, APPROVED=positive, REJECTED=negative)
- Plugin detail: split layout — metadata card left, actions card right
- Categories: tag-style pills using `--rounded-pill` and `--color-primary-pale`

### Public Catalog (consumed by NovaPay instances)
- Plugin cards: `card-content` with capability pills, pricing badge, install CTA
- Search/filter bar: `text-input` + `button-secondary` filter chips
- Detail page: hero band with plugin name, feature cards for capabilities/pricing/versions
