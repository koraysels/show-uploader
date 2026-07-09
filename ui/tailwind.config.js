/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Monochrome, near-achromatic (OKLCH) — matches coming-soon.space
        paper: 'oklch(0.985 0 0)',
        surface: 'oklch(0.998 0 0)',
        ink: 'oklch(0.17 0 0)',
        muted: 'oklch(0.42 0 0)',
        faint: 'oklch(0.58 0 0)',
        line: 'oklch(0.86 0 0)',
        'line-strong': 'oklch(0.17 0 0)',
        accent: 'oklch(0.17 0 0)', // black — inverted buttons/active
        'accent-strong': 'oklch(0.17 0 0)',
        'accent-soft': 'oklch(0.93 0 0)', // light gray wash for hovers/active
        ok: 'oklch(0.5 0.13 150)',
        'ok-soft': 'oklch(0.95 0.04 150)',
        danger: 'oklch(0.5 0.2 27)',
        'danger-soft': 'oklch(0.95 0.05 27)',
      },
      fontFamily: {
        // Everything monospace — the house style
        display: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        // Brutalist: sharp by default
        DEFAULT: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
