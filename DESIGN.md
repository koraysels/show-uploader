# DESIGN.md — Show Uploader

Matches the coming-soon.space house style: brutalist, monochrome, monospace.
An internal tool for the coming-soon.space / Onder Stroom radio crew to publish
archived sets. Utilitarian, high-contrast, no decoration.

## Register
Product. Reference: https://coming-soon.space (stark B/W, mono, dithered, boxed, lowercase).

## Theme
Light, near-achromatic. White page, near-black ink. Surfaces, type and structure
stay monochrome — emphasis by inversion (black fill, white text) and hard black
borders. The one exception is **button colour, which is functional** (below).

Implemented as an MUI theme in `ui/src/theme.ts`. That file is the source of
truth: change colours, spacing and component defaults there, not at the call
site. Anything that starts looking like stock Material is a gap in it.

## Color (OKLCH, ~zero chroma)
- paper `oklch(0.985 0 0)` · surface `oklch(0.998 0 0)`
- ink `oklch(0.17 0 0)` · muted `oklch(0.42 0 0)` · faint `oklch(0.54 0 0)`
- line `oklch(0.86 0 0)` (soft dividers) · border-ink for hard boxes

Authored in OKLCH, shipped as the sRGB hex equivalents — MUI's colour helpers
can't parse `oklch()` and throw at import if handed one.

`faint` is a step darker than the house token: at `oklch(0.58)` it was 4.1:1 on
the paper and it carries 11px captions. Every text/background pair in the app
clears 4.5:1.

## Button colour = what the button does
Monochrome buttons meant the label was the only clue, and "publish to main
website" looked exactly like "unpublish". Four roles, named in `ROLE`
(`ui/src/theme.ts`) — always use the constant, never a raw palette key:

| Role | Colour | Meaning | Examples |
|---|---|---|---|
| `commit` | ink (filled) | the screen's own commit action, one per page | save & start platform uploads |
| `navigate` | blue `oklch(0.5 0.19 260)` | goes somewhere or fetches; changes nothing | youtube ↗, video ↓, watch ▸, edit ↗, ← to process |
| `write` | green `oklch(0.5 0.13 150)` | writes to a record | publish to main website, sync selected, save to agenda, set public, retry |
| `destroy` | red `oklch(0.5 0.2 27)` | destroys or reverses | delete, unpublish, remove, cancel, convert-to-mp4 backfill |

Outlined by default; hover inverts to a solid fill of the same colour, so the
role is unmistakable at the moment of clicking. Neutral grey is for disclosures
that do nothing on their own ("sync platforms" opening a panel).

Colour is never the only signal — labels stay explicit and destructive actions
keep their inline confirm step — so this holds up in greyscale and for colour
blindness. It just makes the common case readable without reading.

## Type
- **Monospace only** (ui-monospace / SF Mono / Menlo). No display serif.
- Headings and labels are **lowercase**. Hierarchy via size + weight, not case.

## Form
- Sharp corners everywhere (borderRadius overridden to 0; `full` kept for dots).
- Hard 1px black borders on boxes/tables/inputs; soft gray row dividers.
- Buttons: bordered box by default, filled for the one commit action per screen.
- Tables are the primary layout on desktop — but they become cards below `md`
  rather than a horizontal scroll. This is used on a phone.
- Tap targets ≥32px; the primary action on a screen ≥44px.
- No gradients, shadows, glass, side-stripes, em dashes.

## The data
Pick list = **draft records in the PocketBase `archive` collection** (past shows
whose recording still needs uploading — the admin's "to process" list), read
with superuser auth. Not `episodes`.
