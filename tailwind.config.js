/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — warm quarried gold/terracotta, replaces the old cool blue.
        // Reused everywhere `primary-*` is already referenced app-wide.
        primary: {
          50:  '#FBF3E8',
          100: '#F3E1C8',
          200: '#E8C89A',
          300: '#DDAC6E',
          400: '#CE8B52',
          500: '#B96F3D',
          600: '#9C5730',
          700: '#7C4526',
          800: '#5C331D',
          900: '#3D2213',
          950: '#241408',
        },
        coral: {
          400: '#E4966A',
          500: '#C86A3D',
          600: '#A8542E',
        },
        // Ink — warm near-black scale for dark shell surfaces (sidebar, login).
        ink: {
          50:  '#F4F1EC',
          100: '#E7E1D6',
          200: '#C9BFAE',
          300: '#8F8471',
          400: '#5E5748',
          500: '#3C362B',
          600: '#2A251D',
          700: '#1E1A14',
          800: '#14110D',
          900: '#0D0B08',
          950: '#070605',
        },
        // Base neutrals — warm stone tones instead of Tailwind's cool blue-gray
        // slate. Overrides the built-in `slate-*` scale used ~700x across the app.
        slate: {
          50:  '#FAF8F5',
          100: '#F3EFE8',
          200: '#E7E0D4',
          300: '#D3C9B8',
          400: '#ABA08C',
          500: '#8A8071',
          600: '#6B6357',
          700: '#524B41',
          800: '#3A342C',
          900: '#26221C',
          950: '#16130E',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        card:     '0 1px 3px rgba(20,15,8,0.06), 0 1px 2px rgba(20,15,8,0.05)',
        elevated: '0 24px 60px rgba(20,15,8,0.16), 0 4px 16px rgba(20,15,8,0.08)',
        ring:     '0 0 0 3px rgba(185,111,61,0.22)',
        gold:     '0 0 0 1px rgba(185,111,61,0.25), 0 8px 28px rgba(185,111,61,0.28)',
        glass:    'inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(20,15,8,0.10)',
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
