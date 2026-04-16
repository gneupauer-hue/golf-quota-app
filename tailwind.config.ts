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
        canvas: "#F4F0E6",
        ink: "#102015",
        pine: "#1F5C3D",
        fairway: "#5F8F61",
        sand: "#E2C37B",
        clay: "#C86B3C",
        danger: "#B3362D",
        mist: "#E9E3D4"
      },
      boxShadow: {
        card: "0 12px 32px rgba(16, 32, 21, 0.12)"
      },
      backgroundImage: {
        hero: "radial-gradient(circle at top, rgba(245, 236, 212, 0.95), rgba(244, 240, 230, 0.96) 35%, rgba(232, 242, 231, 0.98) 100%)"
      }
    }
  },
  plugins: []
};

export default config;
