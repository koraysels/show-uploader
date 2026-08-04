# DESIGN.md — Show Uploader

Matches the coming-soon.space house style: brutalist, monochrome, monospace.
An internal tool for the coming-soon.space / Onder Stroom radio crew to publish
archived sets. Utilitarian, high-contrast, no decoration.

## Register
Product. Reference: https://coming-soon.space (stark B/W, mono, dithered, boxed, lowercase).

## Theme
Light and flat — no shadows, no gradients — but **not uniform**. Read literally,
the original spec produced a page where the background, the cards and the
dividers all sat within a few percent of each other and every piece of text was
as loud as every other. Flat was the intent; featureless wasn't. Hierarchy is
carried by real steps:

- The page is a shade, cards are white. That alone makes a list read as a list
  of objects, and costs nothing.
- A card's own edge is darker than the hairlines inside it.
- Show titles are 17px/700 against 13px body — the thing you scan for looks like
  the thing you scan for.
- Group labels are uppercase and tracked (`LABEL_SX`), so a label never reads as
  content. Applied deliberately, not by restyling `caption` — that also carries
  prose hints, which must stay sentences.
- Emphasis by inversion (black fill, white text) for the one primary action per
  screen; **button colour is functional** (below).

Implemented as an MUI theme in `ui/src/theme.ts`. That file is the source of
truth: change colours, spacing and component defaults there, not at the call
site. Anything that starts looking like stock Material is a gap in it.

## Color
- page `#ebebeb` · surface (cards, inputs) `#ffffff`
- ink `#0f0f0f` · muted `#454545` · faint `#676767`
- line `#c9c9c9` (inside a card) · border `#a8a8a8` (a card's edge)

Shipped as sRGB hex — MUI's colour helpers can't parse `oklch()` and throw at
import if handed one.

`faint` has been darkened twice against the original token: it carries 11px
captions, and the grey page pulls contrast down. Every text/background pair in
the app clears 4.5:1 — checked in a browser, not by eye.

## Shape and colour = what the control does
Ease of use beats purity here — this is a tool someone drives at 1am on a phone,
so it uses the conventions people already know rather than inventing any.

**Shape first.** A bordered box is an action that happens *here*. Underlined text
is a link that takes you somewhere. Don't box a link: five identical outlined
rectangles in a row is worse than no styling at all, because nothing looks more
important than anything else.

**Colour second.** Four roles, named in `ROLE` (`ui/src/theme.ts`) — always use
the constant, never a raw palette key:

| Role | Colour | Meaning | Examples |
|---|---|---|---|
| `commit` | ink | the thing you most likely came to do | ▸ watch, save & start platform uploads |
| `navigate` | blue `oklch(0.45 0.13 262)` | goes somewhere or fetches; changes nothing | YouTube ↗, video ↓, edit ↗, ← to process |
| `write` | green `oklch(0.5 0.13 150)` | writes to a record | publish to main website, sync selected, save to agenda, set public, retry |
| `destroy` | red `oklch(0.5 0.2 27)` | destroys or reverses | delete, unpublish, remove, cancel, convert-to-mp4 backfill |

Buttons are outlined by default; hover inverts to a solid fill of the same
colour. Neutral grey is for disclosures that do nothing on their own ("sync
platforms" opening a panel).

Colour is never the only signal — shape differs, labels stay explicit, and
destructive actions keep their inline confirm step — so this holds up in
greyscale and for colour blindness.

Corners are 2px, not 0. Absolute square read as unfinished at this density.

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
