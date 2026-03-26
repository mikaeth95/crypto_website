import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F14",
        panel: "#11161D",
        panelSoft: "#0F141B",
        panelElevated: "#151C24",
        border: "#1E2630",
        pos: "#22C55E",
        neg: "#EF4444",
        accent: "#4F7CFF",
        textPrimary: "#E6EDF7",
        textSecondary: "#8A97A8",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
