import { sw } from "../utils/responsive";

/**
 * Havena design tokens — Ocean Breeze
 * Five swatches, solid fills only.
 *
 *   #0F3D5F  Navy
 *   #0D9488  Deep Teal
 *   #14B8A6  Primary Teal
 *   #D1FAF5  Soft Mint
 *   #F4F8FD  Canvas
 */

const NAVY = "#0F3D5F";
const DEEP_TEAL = "#0D9488";
const TEAL = "#14B8A6";
const MINT = "#D1FAF5";
const CANVAS = "#F4F8FD";

export const Colors = {
  brandPrimary: TEAL,
  brandPrimaryDeep: NAVY,
  brandSecondaryTeal: DEEP_TEAL,
  brandSeaGreen: TEAL,
  brandFresh: DEEP_TEAL,

  textPrimary: NAVY,
  textSecondary: "#6B7280",
  textMuted: "#6B7280",
  textBody: NAVY,

  surface: "#FFFFFF",
  surfaceMuted: CANVAS,

  borderSubtle: "rgba(15, 61, 95, 0.06)",
  borderInput: "rgba(20, 184, 166, 0.28)",
  borderSignup: "#E5E7EB",
  divider: "#E5E7EB",

  link: NAVY,
  footerMuted: "#6B7280",
  disabledBg: "#E5E7EB",
  error: "#E11D48",
  success: DEEP_TEAL,

  roleAdminBg: MINT,
  roleAdminText: NAVY,
  roleResidentBg: "rgba(13, 148, 136, 0.12)",
  roleResidentText: DEEP_TEAL,
};

export const SolidFills = {
  splash: NAVY,
  notice: NAVY,
  cta: NAVY,
  authScreen: "#FFFFFF",
  authWash: CANVAS,
  softAqua: MINT,
};

export const Layout = {
  screenPadding: sw(18),
  cardRadius: sw(16),
  buttonRadius: sw(12),
  pillRadius: 999,
};

export const Shadows = {
  card: {
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  button: {
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
};
