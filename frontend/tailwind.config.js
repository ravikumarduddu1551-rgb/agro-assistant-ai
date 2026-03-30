/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'agri-dark': '#060E14',   
        'agri-light': '#00DC82',  
        'agri-mid': '#042A27',    
        'agri-bg': '#0B131D',     
        'glass-border': 'rgba(255, 255, 255, 0.08)',
        'glass-bg': 'rgba(10, 20, 30, 0.6)',
      },
      animation: {
        'liquid': 'liquid 8s ease-in-out infinite alternate',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        liquid: {
          '0%': { borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%' },
          '100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
        },
        pulseGlow: {
          '0%': { opacity: '0.4', filter: 'blur(20px)' },
          '100%': { opacity: '0.8', filter: 'blur(30px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
