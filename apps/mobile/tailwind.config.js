/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./constants/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#14B8A6",
          primary: "#14B8A6",
          deep: "#1B4F8A",
          darkTeal: "#0D9488",
          turquoise: "#0D9488",
          green: "#0D9488",
          mint: "#D1FAF5",
        },
        ink: {
          DEFAULT: "#1B4F8A",
          primary: "#1B4F8A",
          secondary: "#6B7280",
          body: "#1B4F8A",
          muted: "#6B7280",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F4F8FD",
          chip: "#D1FAF5",
        },
        border: {
          subtle: "rgba(10, 42, 67, 0.06)",
          input: "rgba(20, 184, 166, 0.28)",
          card: "#E5E7EB",
        },
        hero: {
          start: "#1B4F8A",
          end: "#14B8A6",
        },
      },
      fontFamily: {
        regular: ["Inter-Regular"],
        medium: ["Inter-Medium"],
        semibold: ["Inter-SemiBold"],
        bold: ["Inter-Bold"],
      },
      fontSize: {
        section: ["13px", { lineHeight: "18px", letterSpacing: "1.1px", fontWeight: "700" }],
        hero: ["26px", { lineHeight: "32px", fontWeight: "700" }],
        title: ["22px", { lineHeight: "32px", fontWeight: "700" }],
        subtitle: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        body: ["15px", { lineHeight: "22px", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "18px", fontWeight: "400" }],
        chip: ["14px", { lineHeight: "20px", fontWeight: "600" }],
      },
      borderRadius: {
        card: "16px",
        button: "12px",
        input: "14px",
        pill: "999px",
      },
      spacing: {
        gutter: "24px",
      },
      boxShadow: {
        card: "0px 2px 8px rgba(10, 42, 67, 0.06)",
        fab: "0px 6px 14px rgba(20, 184, 166, 0.28)",
        input: "0px 1px 4px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};
