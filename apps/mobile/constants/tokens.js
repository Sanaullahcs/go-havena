import { sw } from "../utils/responsive";

/**
 * Havena design tokens — Coastal Harbor
 * Deep navy + primary teal / sea green (design system template)
 */
export const Colors = {
  brandPrimary: "#00D9B8",
  brandPrimaryDeep: "#0A2A43",
  brandGradientStart: "#0A2A43",
  brandGradientEnd: "#148BA6",
  brandSeaGreen: "#148BA6",
  brandFresh: "#00C988",
  textPrimary: "#1F2D3D",
  textSecondary: "#6B7280",
  textMuted: "#6B7280",
  textBody: "#1F2D3D",
  surface: "#FFFFFF",
  surfaceMuted: "#F4FBFD",
  borderSubtle: "rgba(10, 42, 67, 0.06)",
  borderInput: "rgba(20, 139, 166, 0.28)",
  borderSignup: "#E6ECEC",
  divider: "#E6ECEC",
  link: "#148BA6",
  footerMuted: "#6B7280",
  disabledBg: "#E6ECEC",
  error: "#E11D48",
  success: "#00C988",
  roleAdminBg: "#E8F8F6",
  roleAdminText: "#148BA6",
  roleResidentBg: "rgba(0, 201, 136, 0.14)",
  roleResidentText: "#00C988",
};

export const Gradients = {
  splash: ["#0A2A43", "#148BA6"],
  notice: ["#0A2A43", "#148BA6"],
  cta: ["#00D9B8", "#148BA6"],
  authScreen: ["rgba(244, 251, 253, 0.95)", "#FFFFFF", "rgba(232, 248, 246, 0.85)"],
};

export const Layout = {
  screenPadding: sw(18),
  cardRadius: sw(16),
  buttonRadius: sw(12),
  pillRadius: 999,
};

export const Shadows = {
  card: {
    shadowColor: "#0A2A43",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  button: {
    shadowColor: "#148BA6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
};
