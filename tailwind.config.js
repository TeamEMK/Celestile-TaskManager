/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        ink: {
          DEFAULT: '#0f172a',
          muted:   '#475569',
          soft:    '#64748b',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#f8fafc',
          sunken:  '#f1f5f9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card:     '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        elevated: '0 4px 12px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
        ring:     '0 0 0 3px rgba(37,99,235,0.15)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'pop-in':  'pop-in 220ms cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
