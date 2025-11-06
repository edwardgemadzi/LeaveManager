/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Score card background gradients
    'bg-gradient-to-br',
    'from-green-200', 'to-emerald-200', 'dark:from-green-900/50', 'dark:to-emerald-900/50',
    'from-blue-200', 'to-indigo-200', 'dark:from-blue-900/50', 'dark:to-indigo-900/50',
    'from-yellow-200', 'to-amber-200', 'dark:from-yellow-900/50', 'dark:to-amber-900/50',
    'from-orange-200', 'to-red-200', 'dark:from-orange-900/50', 'dark:to-red-900/50',
    'from-red-200', 'to-rose-200', 'dark:from-red-900/50', 'dark:to-rose-900/50',
    'from-pink-200', 'to-rose-200', 'dark:from-pink-900/50', 'dark:to-rose-900/50',
    'from-gray-200', 'to-gray-200', 'dark:from-gray-900/50', 'dark:to-gray-900/50',
    // Score card border colors
    'border-green-500', 'dark:border-green-500',
    'border-blue-500', 'dark:border-blue-500',
    'border-yellow-500', 'dark:border-yellow-500',
    'border-orange-500', 'dark:border-orange-500',
    'border-red-500', 'dark:border-red-500',
    'border-pink-500', 'dark:border-pink-500',
    'border-gray-500', 'dark:border-gray-500',
    // Score card gradient colors for icon
    'from-green-500', 'via-emerald-500', 'to-teal-500',
    'from-blue-500', 'via-indigo-500', 'to-purple-500',
    'from-yellow-500', 'via-amber-500', 'to-orange-500',
    'from-orange-500', 'via-red-500', 'to-pink-500',
    'from-red-600', 'via-rose-600', 'to-pink-600',
    'from-red-700', 'via-rose-700', 'to-pink-700',
    'from-pink-500', 'via-rose-500', 'to-pink-600',
    'from-gray-500', 'via-gray-500', 'to-gray-500',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
        purple: {
          50: '#faf5ff',
          100: '#f3e8ff',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.025em' }],
        sm: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.01em' }],
        base: ['1rem', { lineHeight: '1.5rem', letterSpacing: '0' }],
        lg: ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em' }],
        '5xl': ['3rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'colored': '0 10px 25px -5px rgba(99, 102, 241, 0.3)',
        'colored-green': '0 10px 25px -5px rgba(34, 197, 94, 0.3)',
        'colored-yellow': '0 10px 25px -5px rgba(245, 158, 11, 0.3)',
        'colored-red': '0 10px 25px -5px rgba(239, 68, 68, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

