/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          gray: {
            50: '#FBFBFD',
            100: '#F5F5F7',
            200: '#E8E8ED',
            300: '#D2D2D7',
            400: '#86868B',
            500: '#6E6E73',
            600: '#424245',
            700: '#2C2C2E',
            800: '#1C1C1E',
            900: '#121214',
            950: '#0A0A0C',
          },
          blue: {
            DEFAULT: '#0071E3',
            hover: '#0077ED',
            dark: '#2997FF',
          },
          card: {
            light: 'rgba(255, 255, 255, 0.75)',
            dark: 'rgba(28, 28, 30, 0.75)',
          }
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"PingFang SC"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        'apple-sm': '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.06)',
        'apple-card': '0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
        'apple-glow': '0 0 24px -4px rgba(41, 151, 255, 0.35)',
      },
      backdropBlur: {
        'apple': '20px',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      }
    },
  },
  plugins: [],
}
