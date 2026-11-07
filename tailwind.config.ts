import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ash: { 950: "#0a0c0b", 900: "#0f1211", 850: "#141816", 800: "#1a1f1c", 700: "#232a26", 600: "#2f3732", 500: "#454e48" },
        bone: { DEFAULT: "#e9e4d6", dim: "#b9b4a6", mute: "#8d8f86", faint: "#62665f" },
        hazard: { DEFAULT: "#f2a93b", deep: "#c47d14", glow: "#ffc76b" },
        rust: { DEFAULT: "#d0603a", deep: "#8f3a1f" },
        signal: { DEFAULT: "#9be29f", deep: "#4f9a57", glow: "#c8ffcb" },
        steel: { DEFAULT: "#7fa1b8", deep: "#456577" },
      },
      fontFamily: {
        stencil: ["'Big Shoulders Stencil Display'", "Impact", "sans-serif"],
        body: ["Barlow", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      keyframes: {
        flicker: { "0%,100%": { opacity: "1" }, "92%": { opacity: "1" }, "93%": { opacity: ".55" }, "94%": { opacity: "1" }, "97%": { opacity: ".8" } },
        sweep: { "0%": { transform: "rotate(-24deg)" }, "50%": { transform: "rotate(24deg)" }, "100%": { transform: "rotate(-24deg)" } },
        drift: { "0%": { transform: "translateX(-10%)" }, "100%": { transform: "translateX(110%)" } },
        shake: { "0%,100%": { transform: "translateX(0)" }, "20%,60%": { transform: "translateX(-5px)" }, "40%,80%": { transform: "translateX(5px)" } },
        ember: { "0%": { transform: "translateY(0)", opacity: "0" }, "10%": { opacity: ".9" }, "100%": { transform: "translateY(-120px)", opacity: "0" } },
      },
      animation: {
        flicker: "flicker 6s infinite",
        sweep: "sweep 9s ease-in-out infinite",
        drift: "drift 60s linear infinite",
        shake: "shake .4s ease-in-out",
        ember: "ember 5s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
