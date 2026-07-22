import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#11130F",
        panel: "#1A1D17",
        line: "rgba(239, 242, 232, 0.12)",
        mist: "#EFF2E8",
        signal: "#B8FF3D",
        violet: "#EFF2E8",
        amber: "#B8FF3D",
        danger: "#B8FF3D"
      },
      boxShadow: {
        panel: "14px 14px 34px rgba(0,0,0,.34), -8px -8px 24px rgba(239,242,232,.025), inset 0 1px 0 rgba(239,242,232,.09)"
      }
    }
  },
  plugins: []
};

export default config;
