import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#0B315F",
          deep: "#031A38",
          mid: "#075F9F"
        },
        steel: {
          DEFAULT: "#627487",
          light: "#C5D1DC",
          pale: "#E8EEF3"
        },
        brass: {
          DEFAULT: "#62E52D",
          light: "#91F261"
        },
        cotton: {
          DEFAULT: "#F5F9FC",
          warm: "#E8EEF3"
        },
        ink: {
          DEFAULT: "#071B35",
          soft: "#40546B"
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
        card: "0 1px 2px rgba(3,26,56,.06), 0 8px 24px -12px rgba(3,26,56,.18)",
        raised: "0 4px 10px rgba(3,26,56,.08), 0 24px 48px -20px rgba(3,26,56,.28)"
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
