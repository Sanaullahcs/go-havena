import { sw } from "../utils/responsive";
import { rnShadow } from "../utils/shadow";


/**
 * Havena design tokens — Harbor Trust
 * Navy brand chrome + warm orange for primary actions.
 *
 *   #1B4F8A  Primary Navy
 *   #E8782E  Accent Orange (CTAs)
 *   #163A66  Mid Navy
 *   #E8F0F7  Soft Mist
 *   #FFF1E6  Soft Orange
 *   #F6F8FB  Canvas
 */

const NAVY = "#1B4F8A";
const MID = "#163A66";
const PRIMARY = "#1B4F8A";
const ORANGE = "#E8782E";
const ORANGE_DEEP = "#CF6518";
const SOFT = "#E8F0F7";
const SOFT_ORANGE = "#FFF1E6";
const CANVAS = "#F6F8FB";

export const Colors = {
  brandPrimary: PRIMARY,
  brandPrimaryDeep: NAVY,
  brandAccent: ORANGE,
  brandAccentDeep: ORANGE_DEEP,
  brandAccentSoft: SOFT_ORANGE,
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

  link: ORANGE,
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
  cta: ORANGE,
  authScreen: "#FFFFFF",
  authWash: CANVAS,
  softAqua: SOFT,
  softOrange: SOFT_ORANGE,
};

export const Layout = {
  screenPadding: sw(18),
  cardRadius: sw(16),
  buttonRadius: sw(12),
  pillRadius: 999,
};

export const Shadows = {
  card: {
    ...rnShadow({ color: NAVY, offset: { width: 0, height: 2 }, opacity: 0.06, radius: 10 }),
    elevation: 3,
  },
  button: {
    ...rnShadow({ color: ORANGE, offset: { width: 0, height: 4 }, opacity: 0.28, radius: 10 }),
    elevation: 4,
  },
};
