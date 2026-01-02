/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'brand': '#1e88e5', // 360-like blue
                'brand-light': '#42a5f5',
                'brand-dark': '#1565c0',
                'sidebar': '#f0f2f5',
                'success': '#4caf50',
                'warning': '#ff9800',
                'danger': '#f44336',
            },
            keyframes: {
                // Shimmer effect for progress bar
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                },
                // Scale in for modals/dialogs
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.9)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                // Fade in down for dropdown content
                'fade-in-down': {
                    '0%': { opacity: '0', transform: 'translateY(-10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                // Pulse for loading states
                'pulse-soft': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
                // Spin for loading icons
                'spin-slow': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                },
                // Ripple effect for drag feedback
                ripple: {
                    '0%': { transform: 'scale(0)', opacity: '0.5' },
                    '100%': { transform: 'scale(4)', opacity: '0' },
                },
                // Bounce in for success
                'bounce-in': {
                    '0%': { transform: 'scale(0.3)', opacity: '0' },
                    '50%': { transform: 'scale(1.05)' },
                    '70%': { transform: 'scale(0.9)' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
            },
            animation: {
                shimmer: 'shimmer 1.5s infinite linear',
                'scale-in': 'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                'fade-in-down': 'fade-in-down 0.2s ease-out',
                'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
                'spin-slow': 'spin-slow 1s linear infinite',
                ripple: 'ripple 0.6s ease-out',
                'bounce-in': 'bounce-in 0.5s ease-out',
            },
            backdropBlur: {
                xs: '2px',
                '2xl': '40px',
                '3xl': '64px',
            },
        },
    },
    plugins: [],
}
