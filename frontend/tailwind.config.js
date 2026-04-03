/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#0c1222",
        mist: "#64748b",
        accent: "#6366f1",
        accent2: "#22d3ee",
        surface: "#f8fafc",
        card: "#ffffff",
      },
      boxShadow: {
        soft: "0 20px 60px -25px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
};
