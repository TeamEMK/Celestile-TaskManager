/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — gold-yellow accent (#eebc2e), replaces the old warm terracotta.
        // Reused everywhere `primary-*` is already referenced app-wide.
        primary: {
          50:  '#FDF6E3',
          100: '#FBEAB8',
          200: '#F7DA85',
          300: '#F3C955',
          400: '#EEBC2E',
          500: '#D9A81F',
          600: '#B78A16',
          700: '#8F6B10',
          800: '#664D0B',
          900: '#3D2E06',
          950: '#241A03',
        },
        coral: {
          400: '#F3C955',
          500: '#EEBC2E',
          600: '#B78A16',
        },
        // Ink — neutral near-black scale for dark shell surfaces (sidebar, login).
        ink: {
          50:  '#F5F5F5',
          100: '#E5E5E5',
          200: '#D4D4D4',
          300: '#A3A3A3',
          400: '#6B7280',
          500: '#4B5563',
          600: '#374151',
          700: '#1F2937',
          800: '#111111',
          900: '#09090B',
          950: '#000000',
        },
        // Base neutrals — cool neutral grays. Overrides the built-in `slate-*`
        // scale used ~700x across the app.
        slate: {
          50:  '#FAFAFA',
          100: '#F4F4F5',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111111',
          950: '#09090B',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        card:     '0 1px 3px rgba(9,9,11,0.06), 0 1px 2px rgba(9,9,11,0.05)',
        elevated: '0 24px 60px rgba(9,9,11,0.18), 0 4px 16px rgba(9,9,11,0.10)',
        ring:     '0 0 0 3px rgba(238,188,46,0.28)',
        gold:     '0 0 0 1px rgba(238,188,46,0.30), 0 8px 28px rgba(238,188,46,0.33)',
        glass:    'inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(9,9,11,0.12)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
        shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        'gold-sheen': {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-in':   'fade-in 200ms ease-out',
        'pop-in':    'pop-in 220ms cubic-bezier(0.16,1,0.3,1)',
        shimmer:     'shimmer 2.5s linear infinite',
        'gold-sheen':'gold-sheen 3s ease-in-out infinite',
        float:       'float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
