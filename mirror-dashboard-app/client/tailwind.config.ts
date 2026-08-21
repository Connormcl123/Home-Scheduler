import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // The nav rail toggles a `dark` class on <main>; without this the
  // dark: variants would follow the OS preference and never fire.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"]
      },
      colors: {
        mirror: {
          ink: "#18212f",
          soft: "#f4f7fb",
          card: "rgba(255,255,255,0.82)",
          line: "rgba(118,132,153,0.22)"
        }
      },
      boxShadow: {
        panel: "0 20px 55px rgba(35, 55, 82, 0.14)"
      }
    }
  },
  plugins: []
} satisfies Config;
