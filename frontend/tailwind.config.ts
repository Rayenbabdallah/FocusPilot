import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Reference palette (ui-refrence) ───────────────────────────
        mint:       '#98E89E',
        lemon:      '#E8E870',
        periwinkle: '#7080E8',
        lavender:   '#E898E8',
        // ── Background scale ──────────────────────────────────────────
        base:     '#050705',   // page / body
        surface:  '#0d120d',   // subtle card lift over base
        // ── AWS branding (kept) ───────────────────────────────────────
        'aws-orange': '#FF9900',
      },
      fontFamily: {
        // Plus Jakarta Sans: skill's top recommendation for friendly SaaS/productivity
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
