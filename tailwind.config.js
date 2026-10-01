/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Manrope", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      // Theme-aware: these read the CSS variables in app/globals.css, so they
      // follow Night/Light. Opacity modifiers (bg-brand/10) don't work with
      // variables; use the *-soft tokens instead.
      colors: {
        brand: {
          DEFAULT: "var(--accent-soft-text)",
          light: "var(--accent-soft-bg)",
        },
        ink: "var(--text-primary)",
        muted: "var(--text-secondary)",
        border: "var(--border)",
      },
    },
  },
  plugins: [],
};
