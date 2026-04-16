import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F2EA",
        ink: "#1B1B1B",
        pine: "#1F5E3B",
        fairway: "#6E8E72",
        sand: "#C2A878",
        clay: "#A88461",
        danger: "#8C5A50",
        mist: "#E8E2D6",
        grove: "#164A2E",
        card: "#FAF8F2"
      },
      boxShadow: {
        card: "0 10px 28px rgba(31, 53, 38, 0.08)"
      },
      backgroundImage: {
        hero: "radial-gradient(circle at 18% 12%, rgba(194, 168, 120, 0.16), transparent 0 24%), radial-gradient(circle at 82% 10%, rgba(31, 94, 59, 0.08), transparent 0 28%), linear-gradient(180deg, rgba(248, 245, 238, 0.98) 0%, rgba(245, 242, 234, 0.98) 48%, rgba(239, 233, 221, 0.98) 100%)"
      }
    }
  },
  plugins: []
};

export default config;
