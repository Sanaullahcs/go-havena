import { hp, SCREEN_WIDTH } from "../utils/responsive";

/** Instagram-ish cap — tall portraits stop here instead of dominating the feed. */
export const FEED_IMAGE_MAX_HEIGHT = Math.min(hp(55), SCREEN_WIDTH * 1.25);

/** Minimum visible height so wide/short images still feel intentional. */
export const FEED_IMAGE_MIN_HEIGHT = hp(18);

/** Default aspect ratio before image dimensions load (landscape feed photos). */
export const FEED_IMAGE_DEFAULT_ASPECT = 16 / 10;

/** Collapsed body line count before "See more". */
export const FEED_TEXT_COLLAPSED_LINES = 6;
