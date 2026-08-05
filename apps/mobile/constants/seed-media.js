/**
 * Bundled copies of backend `/storage/seed/*` demo images.
 * Used when the device cannot reach the Laravel public disk (LAN / cleartext / stale host).
 */
export const SEED_MEDIA = {
  "alert-weather.jpg": require("../assets/images/seed/alert-weather.jpg"),
  "amenity-clubhouse.jpg": require("../assets/images/seed/amenity-clubhouse.jpg"),
  "amenity-gym.jpg": require("../assets/images/seed/amenity-gym.jpg"),
  "amenity-pool.jpg": require("../assets/images/seed/amenity-pool.jpg"),
  "business-cafe.jpg": require("../assets/images/seed/business-cafe.jpg"),
  "business-fitness.jpg": require("../assets/images/seed/business-fitness.jpg"),
  "business-restaurant.jpg": require("../assets/images/seed/business-restaurant.jpg"),
  "business-salon.jpg": require("../assets/images/seed/business-salon.jpg"),
  "community-cover.jpg": require("../assets/images/seed/community-cover.jpg"),
  "deal-coffee.jpg": require("../assets/images/seed/deal-coffee.jpg"),
  "deal-pizza.jpg": require("../assets/images/seed/deal-pizza.jpg"),
  "deal-spa.jpg": require("../assets/images/seed/deal-spa.jpg"),
  "event-bbq.jpg": require("../assets/images/seed/event-bbq.jpg"),
  "event-townhall.jpg": require("../assets/images/seed/event-townhall.jpg"),
  "feed-dog.jpg": require("../assets/images/seed/feed-dog.jpg"),
  "feed-market.jpg": require("../assets/images/seed/feed-market.jpg"),
  "listing-bike.jpg": require("../assets/images/seed/listing-bike.jpg"),
  "listing-desk.jpg": require("../assets/images/seed/listing-desk.jpg"),
  "listing-plants.jpg": require("../assets/images/seed/listing-plants.jpg"),
  "listing-sofa.jpg": require("../assets/images/seed/listing-sofa.jpg"),
  "listing-stroller.jpg": require("../assets/images/seed/listing-stroller.jpg"),
  "listing-tv.jpg": require("../assets/images/seed/listing-tv.jpg"),
  "notice-maintenance.jpg": require("../assets/images/seed/notice-maintenance.jpg"),
  "wellness-exercise.jpg": require("../assets/images/seed/wellness-exercise.jpg"),
  "wellness-learning.jpg": require("../assets/images/seed/wellness-learning.jpg"),
  "wellness-social.jpg": require("../assets/images/seed/wellness-social.jpg"),
  "wellness-stress.jpg": require("../assets/images/seed/wellness-stress.jpg"),
  "wellness-weight.jpg": require("../assets/images/seed/wellness-weight.jpg"),
};

/** Local require() module for `/storage/seed/<file>` URLs, else null. */
export function resolveSeedMediaSource(urlOrPath) {
  if (urlOrPath == null) return null;
  if (typeof urlOrPath === "number") return urlOrPath;

  const value = String(
    typeof urlOrPath === "object" ? urlOrPath.uri ?? "" : urlOrPath,
  ).trim();
  if (!value) return null;

  const match = value.match(/\/storage\/seed\/([^/?#]+)/i);
  if (!match) return null;

  return SEED_MEDIA[match[1]] ?? null;
}
