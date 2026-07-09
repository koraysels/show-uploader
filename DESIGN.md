# DESIGN.md — Show Uploader

Light, editorial, music-zine. A calm daytime tool for the coming-soon.space /
Onder Stroom radio crew to publish archived sets. Clarity and speed over chrome.

## Register
Product (UI serves the task). Not a marketing surface.

## Theme
Light. Scene: a host at their desk in the afternoon grabbing last night's set,
dropping the file, publishing. Warm paper, ink text — never dark, never clinical.

## Color (OKLCH, warm-tinted neutrals + one accent)
- paper `oklch(0.972 0.008 78)` — page
- surface `oklch(0.995 0.003 80)` — inputs, cards, tables
- ink `oklch(0.24 0.012 60)` — text
- muted `oklch(0.505 0.012 60)` / faint `oklch(0.66 0.010 65)` — secondary/tertiary
- line `oklch(0.905 0.008 75)` / line-strong `oklch(0.83 0.010 70)` — borders
- **accent** vermilion `oklch(0.585 0.19 33)` — primary actions, active state, links (≤10% of surface)
- ok `oklch(0.55 0.13 150)`, danger `oklch(0.55 0.19 25)` (+ `-soft` tints)

## Type
- Display: **Fraunces** (page titles, wordmark) — editorial serif.
- Body/UI: **Inter**. Mono: system ui-monospace for dates/times/keys.
- Hierarchy via scale + weight; section labels are 11px uppercase, tracked.

## Components (see src/index.css @layer components)
`.field` (focus ring = accent tint), `.label`, `.btn-primary` / `.btn-ghost`,
`.card`. Tables are hairline editorial lists (no card-grids). One accent, no
gradients, no side-stripes, no glass.
