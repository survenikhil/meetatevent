/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0C10',
        cloud: '#F5F3EF',
        mist: '#D8D2C7',
        brass: '#9C8B6C',
        tide: '#102A43'
      },
      fontFamily: {
        display: ['"Manrope"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif']
      },
      boxShadow: {
        soft: '0 12px 30px rgba(16, 42, 67, 0.12)'
      }
    }
  },
  plugins: []
};
