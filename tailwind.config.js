/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Classification palette — colorblind-safe leaning (Okabe-Ito inspired).
        cls: {
          brilliant: '#26c6da',
          great: '#22a7f0',
          best: '#81b64c',
          excellent: '#95bb4a',
          good: '#a3a3a3',
          book: '#a88865',
          inaccuracy: '#f7c045',
          mistake: '#e58f2a',
          missed: '#d96b2b',
          blunder: '#d64545',
          forced: '#8a8a8a',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
