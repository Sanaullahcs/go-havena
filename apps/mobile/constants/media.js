/**
 * High-resolution media catalog — use these instead of tiny placeholder PNGs.
 * Minimum recommended source size: 100×100 for thumbnails, 300+ for heroes.
 */
export const Media = {
  /** 390×255 — events, notices, happening soon */
  heroEvent: require("../assets/images/event-image.png"),
  /** 676×320 — deal cards, food promos */
  heroFood: require("../assets/images/food-bowl.png"),
  /** 800×500 — coffee / cafe deals */
  heroCoffee: require("../assets/images/deal-coffee.jpg"),
  /** 128×128 — compact deal thumbs */
  dealThumb: require("../assets/images/food-new.png"),
  /** 128×128 — fitness deals */
  dealFitness: require("../assets/images/zenith-fitness.png"),
  /** 137×96 — restaurant / cafe */
  businessCafe: require("../assets/images/ok-resturant.png"),
  /** 600×400 — spa / wellness business */
  businessSpa: require("../assets/images/business-spa.jpg"),
  /** 400×400 — meditation card */
  wellnessCalm: require("../assets/images/wellness-meditation.jpg"),
  /** 400×400 — exercise card */
  wellnessActive: require("../assets/images/wellness-fitness.jpg"),
  /** Home wellness — Weight & Diet hero */
  wellnessWeightBowl: require("../assets/images/wellness-weight-bowl.jpg"),
  /** Home wellness — Exercise hero */
  wellnessExerciseShoes: require("../assets/images/wellness-exercise-shoes.jpg"),
  /** Home wellness — calm / other pillars */
  wellnessCalmStill: require("../assets/images/wellness-calm-still.jpg"),
  /** Home wellness — Social hero */
  wellnessSocial: require("../assets/images/wellness-social-mugs.jpg"),
  /** Home wellness — Learning hero */
  wellnessLearning: require("../assets/images/wellness-learning-books.jpg"),
  /** 400×400 — default profile / side menu */
  avatarProfile: require("../assets/images/avatar-profile.jpg"),
  avatarJessica: require("../assets/images/avatar-jessica.jpg"),
  avatarMarcus: require("../assets/images/avatar-marcus.jpg"),
  avatarSarah: require("../assets/images/avatar-sarah.jpg"),
};

/** Rotating avatars for mock feed / attendees */
export const AVATARS = [
  Media.avatarJessica,
  Media.avatarMarcus,
  Media.avatarSarah,
];
