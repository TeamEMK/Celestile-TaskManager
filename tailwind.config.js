/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e0fffe',
          100: '#b8fffe',
          200: '#80fffe',
          300: '#3dfffc',
          400: '#00f5ff',
          500: '#00e0ea',
          600: '#00b8c7',
          700: '#0090a0',
          800: '#006d7a',
          900: '#004d57',
          950: '#002f36',
        },
        neon: {
          cyan:   '#00f5ff',
          green:  '#39ff14',
          pink:   '#ff00aa',
          purple: '#bf00ff',
          blue:   '#0080ff',
        },
        dark: {
          900: '#050b14',
          800: '#070f1c',
          700: '#0a1628',
          600: '#0d1e3a',
          500: '#112447',
          400: '#1a3358',
        },
        ink: {
          DEFAULT: '#0f172a',
          muted:   '#475569',
          soft:    '#64748b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card:     '0 1px 3px rgba(0,229,255,0.06), 0 1px 2px rgba(0,0,0,0.3)',
        elevated: '0 4px 16px rgba(0,229,255,0.1), 0 2px 8px rgba(0,0,0,0.4)',
        neon:     '0 0 20px rgba(0,245,255,0.4), 0 0 40px rgba(0,245,255,0.2)',
        'neon-sm':'0 0 8px rgba(0,245,255,0.5)',
        ring:     '0 0 0 3px rgba(0,245,255,0.25)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
        'pulse-neon': {
          '0%,100%': { boxShadow: '0 0 8px rgba(0,245,255,0.4)' },
          '50%':      { boxShadow: '0 0 20px rgba(0,245,255,0.8), 0 0 40px rgba(0,245,255,0.3)' },
        },
      },
      animation: {
        'fade-in':    'fade-in 200ms ease-out',
        'pop-in':     'pop-in 220ms cubic-bezier(0.16,1,0.3,1)',
        'pulse-neon': 'pulse-neon 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
