/**
 * Bundled copies of backend `/storage/seed/*` demo images.
 * Used when the device cannot reach the Laravel public disk (LAN / cleartext / stale host).
 */
export const SEED_MEDIA = {
  "alert-weather.jpg": require("../assets/images/seed/alert-weather.jpg"),
  "amenity-clubhouse.jpg": require("../assets/images/seed/amenity-clubhouse.jpg"),
  "amenity-gym.jpg": require("../assets/images/seed/amenity-gym.jpg"),
  "amenity-pool.jpg": require("../assets/images/seed/amenity-pool.jpg"),
  "avatar-01.jpg": require("../assets/images/seed/avatar-01.jpg"),
  "avatar-02.jpg": require("../assets/images/seed/avatar-02.jpg"),
  "avatar-03.jpg": require("../assets/images/seed/avatar-03.jpg"),
  "avatar-04.jpg": require("../assets/images/seed/avatar-04.jpg"),
  "avatar-05.jpg": require("../assets/images/seed/avatar-05.jpg"),
  "avatar-06.jpg": require("../assets/images/seed/avatar-06.jpg"),
  "avatar-07.jpg": require("../assets/images/seed/avatar-07.jpg"),
  "avatar-08.jpg": require("../assets/images/seed/avatar-08.jpg"),
  "avatar-09.jpg": require("../assets/images/seed/avatar-09.jpg"),
  "avatar-10.jpg": require("../assets/images/seed/avatar-10.jpg"),
  "avatar-11.jpg": require("../assets/images/seed/avatar-11.jpg"),
  "avatar-12.jpg": require("../assets/images/seed/avatar-12.jpg"),
  "avatar-13.jpg": require("../assets/images/seed/avatar-13.jpg"),
  "avatar-14.jpg": require("../assets/images/seed/avatar-14.jpg"),
  "avatar-admin.jpg": require("../assets/images/seed/avatar-admin.jpg"),
  "avatar-alex.jpg": require("../assets/images/seed/avatar-alex.jpg"),
  "business-cafe.jpg": require("../assets/images/seed/business-cafe.jpg"),
  "business-fitness.jpg": require("../assets/images/seed/business-fitness.jpg"),
  "business-florist.jpg": require("../assets/images/seed/business-florist.jpg"),
  "business-grocery.jpg": require("../assets/images/seed/business-grocery.jpg"),
  "business-icecream.jpg": require("../assets/images/seed/business-icecream.jpg"),
  "business-laundry.jpg": require("../assets/images/seed/business-laundry.jpg"),
  "business-pets.jpg": require("../assets/images/seed/business-pets.jpg"),
  "business-pharmacy.jpg": require("../assets/images/seed/business-pharmacy.jpg"),
  "business-restaurant.jpg": require("../assets/images/seed/business-restaurant.jpg"),
  "business-salon.jpg": require("../assets/images/seed/business-salon.jpg"),
  "business-sushi.jpg": require("../assets/images/seed/business-sushi.jpg"),
  "business-wine.jpg": require("../assets/images/seed/business-wine.jpg"),
  "business-yoga.jpg": require("../assets/images/seed/business-yoga.jpg"),
  "business-bakery.jpg": require("../assets/images/seed/business-bakery.jpg"),
  "business-bar.jpg": require("../assets/images/seed/business-bar.jpg"),
  "business-bike.jpg": require("../assets/images/seed/business-bike.jpg"),
  "business-bookstore.jpg": require("../assets/images/seed/business-bookstore.jpg"),
  "business-brunch.jpg": require("../assets/images/seed/business-brunch.jpg"),
  "community-cover.jpg": require("../assets/images/seed/community-cover.jpg"),
  "deal-coffee.jpg": require("../assets/images/seed/deal-coffee.jpg"),
  "deal-pizza.jpg": require("../assets/images/seed/deal-pizza.jpg"),
  "deal-spa.jpg": require("../assets/images/seed/deal-spa.jpg"),
  "event-bbq.jpg": require("../assets/images/seed/event-bbq.jpg"),
  "event-townhall.jpg": require("../assets/images/seed/event-townhall.jpg"),
  "feed-dog.jpg": require("../assets/images/seed/feed-dog.jpg"),
  "feed-market.jpg": require("../assets/images/seed/feed-market.jpg"),
  "feed-harborwalk.jpg": require("../assets/images/seed/feed-harborwalk.jpg"),
  "feed-run.jpg": require("../assets/images/seed/feed-run.jpg"),
  "feed-boxes.jpg": require("../assets/images/seed/feed-boxes.jpg"),
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
