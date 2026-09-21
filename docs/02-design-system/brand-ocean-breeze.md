# Brand Template — Ocean Breeze

> **Status:** Partially applied on mobile **login**, **signup**, and **home**.  
> **Screen primary:** Deep Navy `#0A2A43` (CTAs, logo tile, section labels).  
> Teal accents remain secondary. Solid fills only — no brand gradients.  
> Reference board: [`assets/ocean-breeze-brand.png`](./assets/ocean-breeze-brand.png)

Calm, flat, solid-color system. No brand gradients. No glow. No decorative noise.

## Core swatches

| Name | Hex | Role |
|------|-----|------|
| Deep Navy | `#0A2A43` | Dark text, nav icons, solid hero fills |
| Deep Teal | `#0D9488` | Secondary accent, icon emphasis, success |
| Primary Teal | `#14B8A6` | CTAs, FAB, active nav, highlights |
| Soft Mint | `#D1FAF5` | Icon wells, chips, soft surfaces |
| Canvas | `#F4F8FD` | Page / app background |

## Supporting neutrals

| Name | Hex | Role |
|------|-----|------|
| White | `#FFFFFF` | Cards, sheets, bottom bar |
| Medium Gray | `#6B7280` | Secondary text, inactive nav, “View all” |
| Border | `#E5E7EB` | Card and tile borders |

## Usage ratio (home / marketing surfaces)

| Surface weight | Approx. |
|----------------|---------|
| Canvas + white | ~70% |
| Deep navy | ~12% |
| Primary + deep teal | ~13% |
| Soft mint | ~5% |

This keeps the UI calm and premium without looking sharp or “AI gradient.”

## Component recipes (solid only)

### Hero card
- Fill: `#0A2A43` (solid)
- Title: white; accent word: `#14B8A6`
- CTA: solid `#14B8A6` + white label
- No gradient wash behind the photo or button

### Primary button
- Fill: `#14B8A6`
- Text / trailing icon: `#FFFFFF`
- Shape: pill

### Secondary button
- Fill: `#FFFFFF`
- Border + text: `#0D9488`

### Quick-action tile
- Card: white + `#E5E7EB` border
- Icon: `#0A2A43` (optional mint well `#D1FAF5`)
- Label: `#0A2A43`

### Bottom navigation
- Bar: white
- Active: `#14B8A6`
- Inactive: `#6B7280`
- Center FAB: solid `#14B8A6` + white `+`

## Do / don’t

**Do**
- Use solid fills for heroes and CTAs
- Keep teal accents sparse
- Prefer thin line icons
- Keep cards white on canvas

**Don’t**
- Use `linear-gradient` for brand surfaces
- Add glow, neon edges, or purple accents
- Overuse mint as a large background
- Stack heavy multi-layer shadows

## Source files (asset only)

| File | Purpose |
|------|---------|
| [`design/brand-templates/ocean-breeze.js`](../../design/brand-templates/ocean-breeze.js) | JS brand object (`applied: false`) |
| [`design/brand-templates/ocean-breeze.json`](../../design/brand-templates/ocean-breeze.json) | Machine-readable twin |
| [`assets/ocean-breeze-brand.png`](./assets/ocean-breeze-brand.png) | Visual board |

When ready to apply, map these into live `tokens` / theme files in a dedicated change — do not treat this folder as the runtime source until then.
