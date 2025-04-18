/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        '0eblack': '#0e0e0e',
        'dark-bg': '#0e0e0e',
        'header-bg': '#1c1c1c',
        'border-gray': '#333',
        'start-green': '#4CAF50',
        'stop-red': '#F44336',
        'error-red': '#F44336',
      },
    },
  },
  plugins: [],
};
