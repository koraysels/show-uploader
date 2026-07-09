# DESIGN.md — Show Uploader

Matches the coming-soon.space house style: brutalist, monochrome, monospace.
An internal tool for the coming-soon.space / Onder Stroom radio crew to publish
archived sets. Utilitarian, high-contrast, no decoration.

## Register
Product. Reference: https://coming-soon.space (stark B/W, mono, dithered, boxed, lowercase).

## Theme
Light, near-achromatic. White page, near-black ink. No color accent — emphasis
by inversion (black fill, white text) and hard black borders.

## Color (OKLCH, ~zero chroma)
- paper `oklch(0.985 0 0)` · surface `oklch(0.998 0 0)`
- ink `oklch(0.17 0 0)` · muted `oklch(0.42 0 0)` · faint `oklch(0.58 0 0)`
- line `oklch(0.86 0 0)` (soft dividers) · border-ink for hard boxes
- accent = ink (black); ok/danger reserved for job status only

## Type
- **Monospace only** (ui-monospace / SF Mono / Menlo). No display serif.
- Headings and labels are **lowercase**. Hierarchy via size + weight, not case.

## Form
- Sharp corners everywhere (borderRadius overridden to 0; `full` kept for dots).
- Hard 1px black borders on boxes/tables/inputs; soft gray row dividers.
- Buttons: black fill, white text (`.btn-primary`), or bordered ghost.
- Tables are the primary layout (editorial lists), never card grids.
- No gradients, shadows, glass, side-stripes, em dashes.

## The data
Pick list = **draft records in the PocketBase `archive` collection** (past shows
whose recording still needs uploading — the admin's "to process" list), read
with superuser auth. Not `episodes`.
