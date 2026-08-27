import { sw } from "../utils/responsive";

/**
 * Havena design tokens — Harbor Trust
 * Professional navy for community / HOA platforms.
 *
 *   #1B4F8A  Primary Blue
 *   #163A66  Mid Navy
 *   #E8F0F7  Soft Mist
 *   #F6F8FB  Canvas
 */

const NAVY = "#1B4F8A";
const MID = "#163A66";
const PRIMARY = "#1B4F8A";
const SOFT = "#E8F0F7";
const CANVAS = "#F6F8FB";

export const Colors = {
  brandPrimary: PRIMARY,
  brandPrimaryDeep: NAVY,
  brandSecondaryTeal: MID,
  brandSeaGreen: PRIMARY,
  brandFresh: MID,

  textPrimary: NAVY,
  textSecondary: "#5B6B7C",
  textMuted: "#7C8B9A",
  textBody: NAVY,

  surface: "#FFFFFF",
  surfaceMuted: CANVAS,

  borderSubtle: "rgba(11, 28, 46, 0.06)",
  borderInput: "rgba(27, 79, 138, 0.28)",
  borderSignup: "#E2E8F0",
  divider: "#E2E8F0",

  link: NAVY,
  footerMuted: "#7C8B9A",
  disabledBg: "#E2E8F0",
  error: "#E11D48",
  success: "#059669",

  roleAdminBg: SOFT,
  roleAdminText: NAVY,
  roleResidentBg: "rgba(27, 79, 138, 0.12)",
  roleResidentText: PRIMARY,
};

export const SolidFills = {
  splash: "#FFFFFF",
  notice: NAVY,
  cta: PRIMARY,
  authScreen: "#FFFFFF",
  authWash: CANVAS,
  softAqua: SOFT,
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
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
};
