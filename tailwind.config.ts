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
        canvas: "#F9FAFB",
        ink: "#111827",
        pine: "#7A1E2C",
        fairway: "#9F4A58",
        sand: "#C9A227",
        clay: "#B48A1F",
        danger: "#991B1B",
        mist: "#D8A2AE",
        grove: "#4A0F1A",
        card: "#F8E8EC"
      },
      boxShadow: {
        card: "0 10px 28px rgba(74, 15, 26, 0.10)"
      },
      backgroundImage: {
        hero: "radial-gradient(circle at 18% 12%, rgba(201, 162, 39, 0.12), transparent 0 24%), radial-gradient(circle at 82% 10%, rgba(122, 30, 44, 0.07), transparent 0 28%), linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 250, 251, 0.98) 48%, rgba(248, 232, 236, 0.76) 100%)"
      }
    }
  },
  plugins: []
};

export default config;
