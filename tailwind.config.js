/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: {
          DEFAULT: '#141414',
          2: '#1c1c1c',
          3: '#232323',
        },
        border: {
          DEFAULT: '#2a2a2a',
          soft: '#1f1f1f',
        },
        text: '#f5f5f5',
        muted: {
          DEFAULT: '#888',
          2: '#555',
        },
        accent: {
          DEFAULT: '#d4ff00',
          dim: '#a3c700',
        },
        plus: '#4ade80',
        minus: '#f87171',
        warn: '#fbbf24',
        info: '#60a5fa',
        soll: '#60a5fa',
        ist: '#d4ff00',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
