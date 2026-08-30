/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0f14",
          900: "#0f151b",
          800: "#161e27",
          700: "#1f2a35",
          600: "#2a3743",
          500: "#3d4c59",
        },
        paper: {
          50: "#f7f9fb",
          100: "#eef2f6",
          200: "#e2e8ee",
        },
        brand: {
          50: "#eef4ff",
          100: "#dce8ff",
          400: "#5b8def",
          500: "#3b6fe0",
          600: "#2d59c4",
          700: "#24479c",
        },
        good: {
          50: "#eafaf1",
          100: "#d4f4e2",
          500: "#1fa971",
          600: "#178657",
        },
        warn: {
          50: "#fff8e6",
          100: "#ffedb8",
          500: "#c98a06",
          600: "#a56f04",
        },
        bad: {
          50: "#fdeeee",
          100: "#fad4d4",
          500: "#d94848",
          600: "#b93636",
        },
        role: {
          leadtech: "#1fa971",
          builder: "#c98a06",
          sorter: "#7c5cf0",
          connector: "#1fa971",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 32, 0.06), 0 1px 1px rgba(15,23,32,0.04)",
        popover: "0 12px 32px rgba(15, 23, 32, 0.18)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
