import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        source: {
          0: { bg: '#EEF2FF', fg: '#3730A3' }, // Indigo
          1: { bg: '#F0FDF4', fg: '#15803D' }, // Green
          2: { bg: '#FDF2F8', fg: '#BE185D' }, // Pink
          3: { bg: '#FEF3C7', fg: '#92400E' }, // Amber
          4: { bg: '#DBEAFE', fg: '#0C4A6E' }, // Blue
          5: { bg: '#F5F3FF', fg: '#5B21B6' }, // Violet
          6: { bg: '#FEE2E2', fg: '#7C2D12' }, // Orange
          7: { bg: '#E0E7FF', fg: '#1E1B4B' }, // Deep Indigo
        },
      },
    },
  },
  plugins: [],
} satisfies Config
