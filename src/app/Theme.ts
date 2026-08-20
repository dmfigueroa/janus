import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const janusConfig = defineConfig({
  preflight: false,
  globalCss: {
    "html, body": {
      minHeight: "100%",
    },
    body: {
      background: "bg.canvas",
      color: "fg.default",
      fontFamily: "body",
      textRendering: "optimizeLegibility",
    },
    "::selection": {
      background: "colorPalette.solid",
      color: "colorPalette.contrast",
    },
    "@media (prefers-reduced-motion: reduce)": {
      "& *, & *::before, & *::after": {
        animationDuration: "0.01ms !important",
        animationIterationCount: "1 !important",
        scrollBehavior: "auto !important",
        transitionDuration: "0.01ms !important",
      },
    },
  },
  theme: {
    tokens: {
      fonts: {
        body: {
          value:
            '"Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
        },
        heading: {
          value:
            '"Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
        },
      },
      fontSizes: {
        xs: { value: "0.75rem" },
        sm: { value: "0.875rem" },
        md: { value: "1rem" },
        lg: { value: "1.125rem" },
        "2xl": { value: "1.875rem" },
      },
      fontWeights: {
        medium: { value: 500 },
        bold: { value: 700 },
        extrabold: { value: 800 },
      },
      letterSpacings: {
        tight: { value: "-0.025em" },
        display: { value: "-0.05em" },
        wide: { value: "0.05em" },
      },
      radii: {
        sm: { value: "12px" },
        md: { value: "14px" },
        lg: { value: "16px" },
        card: { value: "18px" },
      },
      durations: {
        fast: { value: "150ms" },
        normal: { value: "200ms" },
        slow: { value: "300ms" },
      },
      easings: {
        out: { value: "ease-out" },
        standard: { value: "ease-in-out" },
      },
      shadows: {
        card: { value: "0 25px 50px -12px rgb(0 0 0 / 0.25)" },
        overlay: { value: "0 10px 15px -3px rgb(0 0 0 / 0.2)" },
        button: { value: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
      },
    },
    semanticTokens: {
      colors: {
        "bg.canvas": {
          value: { base: "#ffffff", _dark: "#141218" },
        },
        "bg.surface": {
          value: { base: "#ffffff", _dark: "#201d25" },
        },
        "bg.subtle": {
          value: { base: "#f5f5f4", _dark: "#28242e" },
        },
        "fg.default": {
          value: { base: "#1a1a1a", _dark: "#fafafa" },
        },
        "fg.muted": {
          value: { base: "#737373", _dark: "#a8a4af" },
        },
        "border.default": {
          value: { base: "#e5e5e5", _dark: "#28242e" },
        },
        "accent.solid": {
          value: "#ff0055",
        },
        "accent.contrast": {
          value: "#ffffff",
        },
        "status.error": {
          value: "#dc2626",
        },
      },
    },
  },
});

export const janusSystem = createSystem(defaultConfig, janusConfig);
