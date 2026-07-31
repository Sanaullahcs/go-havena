/** NeighborLink design tokens — aligned with mobile `constants/tokens.js` */
export const NL = {
  brandPrimary: "#007BFF",
  brandPrimaryDeep: "#0052DF",
  brandGradientEnd: "#0179FF",
  heroGradientStart: "#113D6F",
  textPrimary: "#101828",
  textSecondary: "#4A5565",
  textBody: "#364153",
  textMuted: "#99A1AF",
  surface: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  borderCard: "#EDEDED",
  borderInput: "rgba(190, 219, 255, 0.6)",
  link: "#0179FF",
  success: "#10B981",
  warning: "#D97706",
  danger: "#E7000B",
  canvas: "#F8FAFC",
  chipBg: "#EFF6FF",
  gradientCta: "linear-gradient(135deg, #0052DF 0%, #0179FF 100%)",
  gradientHero: "linear-gradient(135deg, #113D6F 0%, #0052DF 55%, #0179FF 100%)",
  gradientAuthWash:
    "linear-gradient(135deg, rgba(239,246,255,0.95) 0%, #FFFFFF 45%, rgba(236,253,245,0.85) 100%)",
  shadowCard: "0 2px 8px rgba(15, 23, 42, 0.06)",
  radiusCard: "16px",
  radiusButton: "12px",
} as const;

export const CHART_PRIMARY = NL.brandPrimary;
export const CHART_PRIMARY_DEEP = NL.brandPrimaryDeep;
