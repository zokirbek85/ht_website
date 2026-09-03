import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#1B5E3F",
          deep: "#0E3623",
          mid: "#2C7350"
        },
        steel: {
          DEFAULT: "#6E7680",
          light: "#C7CDD1",
          pale: "#E7E9E7"
        },
        brass: {
          DEFAULT: "#B08D57",
          light: "#D9BE8F"
        },
        cotton: {
          DEFAULT: "#F7F5EF",
          warm: "#F1EEE4"
        },
        ink: {
          DEFAULT: "#16201B",
          soft: "#4A544D"
        },
        border: "var(--border)",
        "border-strong": "var(--border-strong)"
      },
      fontFamily: {
        display: ["var(--font-oswald)", "Arial Narrow", "sans-serif"],
        body: ["var(--font-pt-sans)", "Segoe UI", "Tahoma", "sans-serif"],
        mono: ["var(--font-plex-mono)", "SFMono-Regular", "Consolas", "monospace"]
      },
      maxWidth: {
        container: "1320px"
      },
      borderRadius: {
        s: "2px",
        m: "3px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,54,35,.06), 0 8px 24px -12px rgba(14,54,35,.18)",
        raised: "0 4px 10px rgba(14,54,35,.08), 0 24px 48px -20px rgba(14,54,35,.28)"
      },
      keyframes: {
        scrollx: {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        scrollx: "scrollx 2.2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
