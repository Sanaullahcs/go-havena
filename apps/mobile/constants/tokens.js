import { sw } from "../utils/responsive";

/** NeighborLink design tokens — aligned with Figma color styles & design-tokens.md */
export const Colors = {
  brandPrimary: "#007BFF",
  brandPrimaryDeep: "#0052DF",
  brandGradientStart: "#0052DF",
  brandGradientEnd: "#0179FF",
  textPrimary: "#101828",
  textSecondary: "#4A5565",
  textMuted: "#99A1AF",
  textBody: "#364153",
  surface: "#FFFFFF",
  surfaceMuted: "#F9FAFB",
  borderSubtle: "rgba(0, 0, 0, 0.05)",
  borderInput: "rgba(190, 219, 255, 0.5)",
  borderSignup: "#E6E9EE",
  divider: "#D1D1D1",
  link: "#0179FF",
  footerMuted: "#6B7280",
  disabledBg: "#E5E7EB",
  error: "#E7000B",
  success: "#10B981",
  /** Admin/resident role chips on signup */
  roleAdminBg: "#D4ECF5",
  roleAdminText: "#007BFF",
  roleResidentBg: "rgba(193, 255, 114, 0.2)",
  roleResidentText: "#008236",
};

export const Gradients = {
  splash: [Colors.brandPrimaryDeep, Colors.brandGradientEnd],
  /** Figma auth screens — soft blue/green wash at 80% opacity */
  authScreen: ["rgba(239, 246, 255, 0.8)", "#FFFFFF", "rgba(236, 253, 245, 0.8)"],
  cta: ["rgba(0, 82, 223, 1)", "rgba(1, 121, 255, 1)"],
};

export const Layout = {
  screenPadding: sw(18),
  cardRadius: sw(14),
  buttonRadius: sw(12),
  pillRadius: 999,
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  button: {
    shadowColor: Colors.brandPrimaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
};
