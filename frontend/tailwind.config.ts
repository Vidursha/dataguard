import type { Config } from 'tailwindcss'

/**
 * DataGuard design system. Every color is a semantic token backed by a CSS
 * variable in src/index.css, so light and dark themes share one set of names.
 * Components use only these tokens (bg-surface, text-ink-muted, ...), never raw colors.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), muted: token('surface-muted') },
        border: { DEFAULT: token('border'), strong: token('border-strong') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted'), subtle: token('ink-subtle') },
        brand: {
          DEFAULT: token('brand'),
          hover: token('brand-hover'),
          soft: token('brand-soft'),
          ink: token('brand-ink'),
          on: token('on-brand'),
        },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        chart: { series: token('chart-series'), grid: token('chart-grid'), axis: token('chart-axis') },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        // Type scale: [font-size, line-height]
        xs: ['0.75rem', '1rem'],
        sm: ['0.875rem', '1.25rem'],
        base: ['1rem', '1.5rem'],
        lg: ['1.125rem', '1.75rem'],
        xl: ['1.25rem', '1.75rem'],
        '2xl': ['1.5rem', '2rem'],
        '3xl': ['1.875rem', '2.25rem'],
      },
      borderRadius: { card: '0.875rem', control: '0.5rem' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        raised: '0 4px 12px rgb(15 23 42 / 0.08), 0 2px 4px rgb(15 23 42 / 0.04)',
      },
      spacing: { sidebar: '16rem' },
    },
  },
  plugins: [],
} satisfies Config
