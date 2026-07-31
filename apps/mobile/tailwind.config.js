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
          DEFAULT: "#007BFF",
          primary: "#007BFF",
          deep: "#0052DF",
          end: "#0179FF",
        },
        ink: {
          DEFAULT: "#11181C",
          primary: "#101828",
          secondary: "#4A5565",
          body: "#364153",
          muted: "#99A1AF",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F9FAFB",
          chip: "#EFF6FF",
        },
        border: {
          subtle: "rgba(0,0,0,0.05)",
          input: "rgba(190,219,255,0.6)",
          card: "#EDEDED",
        },
        hero: {
          start: "#113D6F",
          end: "#0052DF",
        },
      },
      fontFamily: {
        regular: ["Inter-Regular"],
        medium: ["Inter-Medium"],
        semibold: ["Inter-SemiBold"],
        bold: ["Inter-Bold"],
      },
      fontSize: {
        "section": ["13px", { lineHeight: "18px", letterSpacing: "1.1px", fontWeight: "700" }],
        "hero": ["26px", { lineHeight: "32px", fontWeight: "700" }],
        "title": ["22px", { lineHeight: "32px", fontWeight: "700" }],
        "subtitle": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body": ["15px", { lineHeight: "22px", fontWeight: "400" }],
        "caption": ["13px", { lineHeight: "18px", fontWeight: "400" }],
        "chip": ["14px", { lineHeight: "20px", fontWeight: "600" }],
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
        card: "0px 2px 8px rgba(15, 23, 42, 0.06)",
        fab: "0px 6px 14px rgba(0, 82, 223, 0.28)",
        input: "0px 1px 4px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};
