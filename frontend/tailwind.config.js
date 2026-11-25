/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg)',
        background: 'var(--bg)',
        bg: 'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          card: 'var(--surface)',
          hover: 'var(--surface-raised)',
        },
        elevated: 'var(--surface-raised)',
        accent: 'var(--accent)',
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          input: 'var(--border-input)',
        },
        line: 'var(--border)',
        text: 'var(--text)',
        ink: 'var(--text)',
        muted: 'var(--muted)',
        subtle: 'var(--muted-2)',
        navy: 'var(--text)',
        gold: 'var(--warning)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          soft: 'var(--primary-soft)',
          ink: 'var(--primary-ink)',
          border: 'var(--primary-border)',
          contrast: 'var(--primary-contrast)',
        },
        positive: {
          DEFAULT: 'var(--positive)',
          hover: 'var(--positive-hover)',
          soft: 'var(--positive-soft)',
          border: 'var(--positive-border)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          hover: 'var(--danger-hover)',
          contrast: 'var(--danger-contrast)',
          soft: 'var(--danger-soft)',
          border: 'var(--danger-border)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
          border: 'var(--warning-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
          border: 'var(--info-border)',
        },
      },
      spacing: {
        4.5: '1.125rem',
        18: '4.5rem',
      },
      borderWidth: {
        5: '5px',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Plus Jakarta Sans Variable',
          'Plus Jakarta Sans',
          'Inter Variable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        soft: 'var(--shadow)',
        card: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        lift: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
        dropdown: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        '4xl': '1.75rem',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionDuration: {
        250: '250ms',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 160ms ease-out',
      },
    },
  },
  plugins: [],
}
