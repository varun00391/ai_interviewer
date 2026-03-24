/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0d12', 800: '#1a1f2e', 600: '#4b5569' },
        mist: '#e8ecf4',
        accent: { DEFAULT: '#6366f1', dim: '#4f46e5' },
      },
    },
  },
  plugins: [],
}
