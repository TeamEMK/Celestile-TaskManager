/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — gold-yellow accent (#eebc2e). The values live as CSS tokens in
        // globals.css (:root --c-primary-*) so a theme can swap the whole scale.
        primary: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
            .map((k) => [k, `rgb(var(--c-primary-${k}) / <alpha-value>)`])
        ),
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
        gold:     '0 0 0 1px rgba(238,188,46,0.30), 0 8px 28px rgba(238,188,46,0.33)',
        glass:    'inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(9,9,11,0.12)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
          '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-in':   'fade-in 200ms ease-out',
        'pop-in':    'pop-in 220ms cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
