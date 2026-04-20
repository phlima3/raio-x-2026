import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        civic: {
          green: '#16a34a',
          yellow: '#ca8a04',
          red: '#dc2626',
        },
        paper: {
          DEFAULT: '#f1ebdc',
          light: '#f6f1e3',
          dark: '#e6dec9',
        },
        ink: {
          DEFAULT: '#1a1614',
          muted: '#554c45',
          soft: '#8a8079',
        },
        ember: {
          DEFAULT: '#b8321f',
          dark: '#8c2716',
          light: '#d9573d',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
