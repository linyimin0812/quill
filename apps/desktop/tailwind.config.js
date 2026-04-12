/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        ui: ['Sora', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        acc: 'var(--acc)',
        acc2: 'var(--acc2)',
        panel: 'var(--panel)',
        surf: 'var(--surf)',
        brd: 'var(--brd)',
      },
    },
  },
  plugins: [],
};
