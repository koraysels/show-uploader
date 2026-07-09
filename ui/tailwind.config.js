/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm tinted neutrals (OKLCH) — light editorial "paper + ink"
        paper: 'oklch(0.972 0.008 78)',
        surface: 'oklch(0.995 0.003 80)',
        ink: 'oklch(0.24 0.012 60)',
        muted: 'oklch(0.505 0.012 60)',
        faint: 'oklch(0.66 0.010 65)',
        line: 'oklch(0.905 0.008 75)',
        'line-strong': 'oklch(0.83 0.010 70)',
        accent: 'oklch(0.585 0.19 33)', // vermilion
        'accent-strong': 'oklch(0.52 0.19 33)',
        'accent-soft': 'oklch(0.95 0.045 45)',
        ok: 'oklch(0.55 0.13 150)',
        'ok-soft': 'oklch(0.95 0.05 150)',
        danger: 'oklch(0.55 0.19 25)',
        'danger-soft': 'oklch(0.95 0.05 25)',
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px oklch(0.4 0.02 60 / 0.04), 0 8px 24px oklch(0.4 0.02 60 / 0.06)',
        pop: '0 12px 40px oklch(0.3 0.02 60 / 0.14)',
      },
    },
  },
  plugins: [],
};
