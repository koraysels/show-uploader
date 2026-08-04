import { createTheme } from '@mui/material/styles';

/**
 * MUI configured to DESIGN.md, not to Material.
 *
 * The house style is brutalist: sharp corners, monospace only, near-achromatic
 * palette, hard 1px borders, no shadows or gradients. Material's defaults are
 * the opposite of every one of those, so almost all of this file is overrides.
 * Anything Material-looking that shows up in the UI is a gap here, not a
 * decision — fix it in this file rather than patching it at the call site.
 */

/**
 * The DESIGN.md ramp, as sRGB hex.
 *
 * The tokens are authored in OKLCH (the comment on each line is the original),
 * but MUI's colour manipulators — alpha(), darken(), the hover overlays it
 * generates for Table rows and Buttons — parse only #nnn, #nnnnnn, rgb(), hsl()
 * and color(). Handing them an oklch() string throws at import time and takes
 * the whole app down, so these are the browser-computed sRGB equivalents.
 *
 * `faint` is the one deliberate departure: oklch(0.58) rendered at 4.1:1 against
 * the paper, under the 4.5:1 minimum, and it's used for 11px captions — the
 * text that most needs the contrast. It's a step darker here.
 */
export const c = {
  paper: '#fafafa', // oklch(0.985 0 0)
  surface: '#fefefe', // oklch(0.998 0 0)
  ink: '#0f0f0f', // oklch(0.17 0 0)
  inkHover: '#292929', // oklch(0.28 0 0)
  muted: '#4d4d4d', // oklch(0.42 0 0)
  faint: '#6b6b6b', // was oklch(0.58 0 0) → #7a7a7a, too low-contrast for captions
  line: '#d1d1d1', // oklch(0.86 0 0)
  accentSoft: '#e8e8e8', // oklch(0.93 0 0)
  ok: '#137738', // oklch(0.5 0.13 150)
  okSoft: '#dcf7e1', // oklch(0.95 0.04 150)
  danger: '#bb0916', // oklch(0.5 0.2 27)
  dangerSoft: '#ffe3dd', // oklch(0.95 0.05 27)
  link: '#1a56a8', // deeper and less saturated than a stock link blue — it
  linkSoft: '#e7eef8', // appears often, and electric blue on off-white is tiring
} as const;

/**
 * What a control's colour means.
 *
 *   primary (ink)   the thing you most likely came to do — filled or bordered
 *   info    (blue)  navigation: goes somewhere, fetches; changes nothing
 *   success (green) writes to a record: publish, sync, save, generate
 *   error   (red)   destroys or reverses: delete, unpublish, remove, cancel
 *
 * Shape carries as much of the meaning as colour, and the split is the ordinary
 * one people already know from every other site:
 *
 *   a bordered box = an action that does something here
 *   underlined text = a link that takes you somewhere
 *
 * Boxing the links too — five identical outlined rectangles in a row, all blue —
 * was worse than no colour at all: everything shouted at the same volume and
 * nothing looked like the primary action. Reserve boxes for actions.
 *
 * Colour is never the only signal — labels stay explicit, destructive actions
 * keep their confirm step — so this holds up in greyscale and for colour
 * blindness.
 */
export const ROLE = {
  commit: 'primary',
  navigate: 'info',
  write: 'success',
  destroy: 'error',
} as const;

const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** `#rrggbb` + alpha → rgba(). Plain rgba() rather than the relative-colour
 *  `rgb(from … / x%)` syntax, which not every engine resolves and which no
 *  contrast tooling can read. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The `main` colour for whatever palette a component was given. `inherit` and
 *  the odd unset case fall back to ink. */
function paletteMain(theme: { palette: unknown }, color?: string): string {
  if (!color || color === 'inherit') return c.ink;
  const entry = (theme.palette as Record<string, { main?: string } | undefined>)[color];
  return entry?.main ?? c.ink;
}

export const theme = createTheme({
  cssVariables: true,
  // 2px, not 0. Hairline rounding is the difference between "brutalist" and
  // "unfinished" at this density, and this is a tool someone uses at 1am on a
  // phone — familiar beats doctrinaire.
  shape: { borderRadius: 2 },
  // Every elevation flat: DESIGN.md bans shadows outright. MUI wants 25 entries.
  shadows: Array(25).fill('none') as never,
  palette: {
    mode: 'light',
    background: { default: c.paper, paper: c.surface },
    text: { primary: c.ink, secondary: c.muted, disabled: c.faint },
    primary: { main: c.ink, contrastText: c.paper },
    secondary: { main: c.muted, contrastText: c.paper },
    success: { main: c.ok, light: c.okSoft, contrastText: c.paper },
    error: { main: c.danger, light: c.dangerSoft, contrastText: c.paper },
    info: { main: c.link, light: c.linkSoft, contrastText: c.paper },
    divider: c.line,
  },
  typography: {
    fontFamily: mono,
    // Tight ratio — product register, many type elements, exaggerated contrast
    // would just add noise.
    h1: { fontFamily: mono, fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.01em', textTransform: 'lowercase' },
    h2: { fontFamily: mono, fontSize: '1.125rem', fontWeight: 600, textTransform: 'lowercase' },
    h3: { fontFamily: mono, fontSize: '1rem', fontWeight: 600 },
    body1: { fontFamily: mono, fontSize: '0.875rem' },
    body2: { fontFamily: mono, fontSize: '0.8125rem' },
    caption: { fontFamily: mono, fontSize: '0.6875rem', letterSpacing: '0.02em', textTransform: 'lowercase' },
    button: { fontFamily: mono, fontSize: '0.875rem', fontWeight: 500, textTransform: 'lowercase' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: c.paper, color: c.ink, WebkitFontSmoothing: 'antialiased' },
        '::selection': { background: c.ink, color: c.paper },
        // Plain anchors (the TanStack Router links that can't take MUI's Link)
        // lose the browser default ring inside ButtonBase-heavy pages.
        'a:focus-visible': { outline: `2px solid ${c.ink}`, outlineOffset: '2px' },
      },
    },
    // Buttons are boxes: hard border, square, fill-invert on hover. No ripple —
    // Material's ripple is exactly the kind of decorative motion the product
    // register bans.
    // Turning the ripple off also removed the only thing that showed keyboard
    // focus — MUI's ButtonBase sets `outline: 0` and relies on the ripple. Put a
    // real ring back, or the whole app is untabbable-by-sight.
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': { outline: `2px solid ${c.ink}`, outlineOffset: '2px' },
        },
      },
    },
    MuiButton: {
      defaultProps: { variant: 'outlined', disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 2,
          padding: '8px 16px',
          transition: 'background-color 0.12s ease, color 0.12s ease',
        },
        // Colour-aware: the border and label take the button's palette colour, so
        // `color="error"` reads as destructive without any per-call-site styling.
        // Hover still inverts to a solid fill — that's the house pattern, and it
        // makes the role unmistakable at the moment of clicking.
        outlined: ({ theme, ownerState }) => {
          const main = paletteMain(theme, ownerState.color);
          return {
            border: `1px solid ${main}`,
            color: main,
            backgroundColor: c.surface,
            '&:hover': { border: `1px solid ${main}`, backgroundColor: main, color: c.paper },
            '&.Mui-disabled': { border: `1px solid ${c.line}`, color: c.faint },
          };
        },
        contained: ({ theme, ownerState }) => ({
          backgroundColor: paletteMain(theme, ownerState.color),
          color: c.paper,
          border: `1px solid ${paletteMain(theme, ownerState.color)}`,
          '&:hover': { filter: 'brightness(1.35)' },
          '&.Mui-disabled': { backgroundColor: c.line, borderColor: c.line, color: c.faint },
        }),
        // Text buttons are the quiet tier — a bare `color="error"` one still
        // reads red, which is how "delete" and "unpublish" announce themselves
        // without shouting a filled box at the operator.
        text: ({ theme, ownerState }) => {
          const main = ownerState.color && ownerState.color !== 'primary' ? paletteMain(theme, ownerState.color) : c.muted;
          return {
            color: main,
            padding: 0,
            minWidth: 0,
            '&:hover': { backgroundColor: 'transparent', color: main, textDecoration: 'underline' },
          };
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 2 } } },
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: {
        // Ink by default (a link in running text shouldn't turn blue), but a
        // palette colour on the prop still wins — `color="info"` is how the
        // "open on YouTube" style of link marks itself as navigation.
        root: ({ theme, ownerState }) => {
          const named = typeof ownerState.color === 'string' && ownerState.color in theme.palette;
          return {
            color: named ? paletteMain(theme, ownerState.color as string) : c.ink,
            textUnderlineOffset: '2px',
            textDecorationColor: 'currentColor',
          };
        },
      },
    },
    // Inputs mirror the old `.field`: square, hard black border, inset focus
    // ring instead of Material's floating-label + underline treatment.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          backgroundColor: c.surface,
          fontFamily: mono,
          fontSize: '0.875rem',
          '& fieldset': { borderColor: c.ink },
          '&:hover fieldset': { borderColor: c.ink },
          '&.Mui-focused fieldset': { borderColor: c.ink, borderWidth: 1 },
          '&.Mui-focused': { boxShadow: `inset 0 0 0 1px ${c.ink}` },
        },
        input: { padding: '8px 12px', '&::placeholder': { color: c.faint, opacity: 1 } },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontFamily: mono, fontSize: '0.6875rem', textTransform: 'lowercase', color: c.muted },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: { label: { fontFamily: mono, fontSize: '0.875rem' } },
    },
    MuiCheckbox: {
      defaultProps: { disableRipple: true, size: 'small' },
      styleOverrides: { root: { borderRadius: 2, color: c.ink, '&.Mui-checked': { color: c.ink } } },
    },
    // Boxes, not cards: 1px line, no elevation, no rounding.
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', borderRadius: 2 },
        outlined: { border: `1px solid ${c.line}` },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: c.line } } },
    // `full` radius survives only for dots and status pills, per DESIGN.md.
    MuiChip: {
      defaultProps: { size: 'small', variant: 'outlined' },
      styleOverrides: {
        // 28px, not MUI's 24: these are tappable (tag delete, "+ suggested").
        root: { fontFamily: mono, fontSize: '0.6875rem', textTransform: 'lowercase', borderRadius: 999, height: 28 },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 6, borderRadius: 0, backgroundColor: c.line },
        bar: { borderRadius: 0 },
      },
    },
    MuiTooltip: {
      defaultProps: { enterTouchDelay: 0, leaveTouchDelay: 4000 },
      styleOverrides: {
        tooltip: {
          fontFamily: mono,
          fontSize: '0.6875rem',
          textTransform: 'lowercase',
          borderRadius: 2,
          backgroundColor: c.ink,
          color: c.paper,
          maxWidth: 320,
        },
      },
    },
    MuiTable: { styleOverrides: { root: { borderCollapse: 'collapse' } } },
    MuiTableCell: {
      styleOverrides: {
        root: { fontFamily: mono, fontSize: '0.875rem', borderColor: c.line },
        head: { fontSize: '0.6875rem', textTransform: 'lowercase', color: c.muted, fontWeight: 500 },
      },
    },
    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: { root: { borderRadius: 0, backgroundColor: c.line } },
    },
    MuiAlert: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { borderRadius: 2, fontFamily: mono, fontSize: '0.8125rem' },
      },
    },
  },
});
