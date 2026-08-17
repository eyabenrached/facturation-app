/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#2b3440",
          navy: "#2f5d8a",
          "navy-deep": "#1d3f60",
          amber: "#d99a2b",
          "amber-dark": "#b17f18",
          "amber-soft": "#fbf1de",
          teal: "#189a63",
          "teal-soft": "#e5f5ec",
          coral: "#d1594b",
          "coral-soft": "#fbe7e4",
          "gold-soft": "#fbf1de",
          paper: "#f7f8f5",
          surface: "#ffffff",
          line: "#e6e9e3",
          "line-strong": "#d2d7cd",
          muted: "#6b7660",
          "muted-2": "#9aa393",
        },
      },
      fontFamily: {
        display: ["Big Shoulders Display", "Impact", "sans-serif"],
        body: ["IBM Plex Sans", "Segoe UI", "Arial", "sans-serif"],
        data: ["IBM Plex Mono", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(15, 28, 51, 0.06)",
        md: "0 8px 24px rgba(15, 28, 51, 0.10)",
      },
      keyframes: {
        "derive-route": {
          from: { opacity: 0.75 },
          to: { opacity: 1 },
        },
      },
      animation: {
        "derive-route": "derive-route 12s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};
