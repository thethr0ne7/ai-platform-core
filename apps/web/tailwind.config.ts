import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0b",
        panel: "#111214",
        line: "#24262b",
        mist: "#a6a8ad",
        signal: "#b8ff5a",
        violet: "#8b5cff",
        amber: "#ffcf66",
        danger: "#ff7a7a"
      },
      boxShadow: {
        panel: "0 20px 60px rgba(0,0,0,.28)"
      }
    }
  },
  plugins: []
};

export default config;
