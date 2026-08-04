import { sw } from "../utils/responsive";
import { HavenaColors as H } from "./color-scheme";

/** Primary brand — Ocean Breeze teal (solid only, no gradients). */
export const PRIMARY = H.primary.main;

/**
 * Havena design tokens — Ocean Breeze
 * #0A2A43 navy · #0D9488 dark teal · #14B8A6 primary · #D1FAF5 mint · #F4F8FD canvas
 */
export const Colors = {
  brandPrimary: PRIMARY,
  brandPrimaryDeep: H.secondary.navy,
  brandSecondaryTeal: H.secondary.darkTeal,
  brandSecondaryTurquoise: H.secondary.darkTeal,
  brandSecondaryGreen: H.secondary.green,
  brandSeaGreen: PRIMARY,
  brandFresh: H.secondary.darkTeal,

  textPrimary: H.neutral.darkText,
  textSecondary: H.neutral.mediumGray,
  textMuted: H.neutral.mediumGray,
  textBody: H.neutral.darkText,

  surface: H.neutral.white,
  surfaceMuted: H.primary.canvas,

  borderSubtle: "rgba(10, 42, 67, 0.06)",
  borderInput: "rgba(20, 184, 166, 0.28)",
  borderSignup: "#E6ECEC",
  divider: "#E6ECEC",

  link: PRIMARY,
  footerMuted: H.neutral.mediumGray,
  disabledBg: "#E6ECEC",
  error: "#E11D48",
  success: H.secondary.darkTeal,

  roleAdminBg: H.primary.softMint,
  roleAdminText: PRIMARY,
  roleResidentBg: "rgba(13, 148, 136, 0.12)",
  roleResidentText: H.secondary.darkTeal,

  /** @deprecated Use brandPrimary — solid only */
  brandGradientStart: PRIMARY,
  /** @deprecated Use brandPrimary — solid only */
  brandGradientEnd: PRIMARY,
};

/** Solid screen fills (replaces gradient arrays). */
export const SolidFills = {
  splash: H.secondary.navy,
  notice: PRIMARY,
  cta: PRIMARY,
  authScreen: H.neutral.white,
  authWash: H.primary.canvas,
  softAqua: H.primary.softMint,
};

/** @deprecated Use SolidFills — kept for gradual migration */
export const Gradients = {
  splash: [SolidFills.splash, SolidFills.splash],
  notice: [SolidFills.notice, SolidFills.notice],
  cta: [SolidFills.cta, SolidFills.cta],
  authScreen: [SolidFills.authWash, SolidFills.authWash],
};

export const Layout = {
  screenPadding: sw(18),
  cardRadius: sw(16),
  buttonRadius: sw(12),
  pillRadius: 999,
};

export const Shadows = {
  card: {
    shadowColor: H.secondary.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  button: {
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
};
