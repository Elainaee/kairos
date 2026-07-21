/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{html,js,cjs}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "secondary-container": "#e8e3d0", "inverse-primary": "#ffb59d", background: "#fbf9f2",
        "secondary-fixed-dim": "#cbc7b5", "surface-container-low": "#f5f4ed", primary: "#9e3d19",
        "on-tertiary-container": "#f6feff", "canvas-bone": "#F9F7F0", "surface-container": "#f0eee7",
        "surface-bright": "#fbf9f2", "primary-container": "#be552f", "surface-tint": "#a1401b",
        "error-container": "#ffdad6", tertiary: "#00666f", "primary-fixed": "#ffdbd0", surface: "#fbf9f2",
        "primary-fixed-dim": "#ffb59d", "tertiary-fixed": "#8af2ff", "on-primary": "#ffffff",
        "on-surface": "#1b1c18", "surface-container-high": "#eae8e1", "tertiary-container": "#00818c",
        "on-background": "#1b1c18", "tertiary-fixed-dim": "#6bd6e3", "on-secondary-container": "#676556",
        "on-error-container": "#93000a", "surface-muted": "#EBE6D6", "on-error": "#ffffff",
        "on-tertiary-fixed": "#001f23", outline: "#8a726a", secondary: "#615f50", "on-tertiary": "#ffffff",
        "accent-terracotta": "#D1633C", "surface-dim": "#dcdad3", "on-primary-fixed-variant": "#812904",
        "surface-variant": "#e4e2dc", "on-tertiary-fixed-variant": "#004f56", "outline-variant": "#ddc0b7",
        "surface-container-lowest": "#ffffff", "secondary-fixed": "#e8e3d0", "ink-bold": "#3D3B2E",
        "on-primary-fixed": "#390c00", "surface-container-highest": "#e4e2dc", "on-secondary-fixed": "#1d1c11",
        error: "#ba1a1a", "inverse-on-surface": "#f3f1ea", "on-surface-variant": "#57423c",
        "on-secondary-fixed-variant": "#494739", "inverse-surface": "#30312c", "on-primary-container": "#fffbff",
        "on-secondary": "#ffffff"
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: { "container-margin": "32px", "stack-md": "16px", unit: "8px", "stack-lg": "32px", gutter: "16px", "stack-sm": "8px" },
      fontFamily: {
        "headline-lg": ["Outfit", "sans-serif"], "title-md": ["Outfit", "sans-serif"],
        "headline-lg-mobile": ["Outfit", "sans-serif"], "body-md": ["Outfit", "sans-serif"],
        "label-md": ["Outfit", "sans-serif"], "display-lg": ["Outfit", "sans-serif"],
        "label-sm": ["Outfit", "sans-serif"], "body-lg": ["Outfit", "sans-serif"]
      },
      fontSize: {
        "headline-lg": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "title-md": ["20px", { lineHeight: "1.4", fontWeight: "500" }],
        "headline-lg-mobile": ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        "body-md": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "600" }],
        "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "label-sm": ["12px", { lineHeight: "1", fontWeight: "500" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }]
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};
