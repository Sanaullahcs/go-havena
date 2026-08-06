/** Canonical marketplace stack routes (expo-router). */

export const MarketplaceRoutes = {
  HOME: "/(tabs)/marketplace",
  COMMUNITY: "/(tabs)/community",
  DEALS: "/(tabs)/marketplace/deals-offer",
  DEAL_DETAILS: "/(tabs)/marketplace/deal-details",
  MY_COUPONS: "/(tabs)/marketplace/my-coupons",
  REDEEM_COUPON: "/(tabs)/marketplace/redeem-coupon",
  CONFIRM_REDEEM: "/(tabs)/marketplace/confirm-redeem",
  ALL_BUSINESSES: "/(tabs)/marketplace/all-marketplace",
  MANAGE: "/(tabs)/marketplace/manage-marketplace",
  ADD_BUSINESS: "/(tabs)/marketplace/add-business",
  CREATE_DEAL: "/(tabs)/marketplace/create-deal",
  PROVIDER_PROFILE: "/(tabs)/marketplace/provider-profile",
  BUSINESS_DEALS: "/(tabs)/marketplace/business-deals",
  REVIEWS: "/(tabs)/marketplace/reviews",
  WRITE_REVIEW: "/(tabs)/marketplace/write-review",
  CREATE_LISTING: "/screens/createListing",
  COMMUNITY_LISTINGS: "/screens/community-listings",
  LISTING_DETAIL: "/screens/listing-detail",
  ADMIN_LISTINGS: "/screens/admin-listings",
};

export function withMarketplaceRole(role, params = {}) {
  return { ...params, role: role || "resident" };
}

export function dealDetailsParams(deal, role) {
  return withMarketplaceRole(role, {
    id: deal.id != null ? String(deal.id) : "",
    businessId: deal.businessId != null ? String(deal.businessId) : "",
    title: deal.title ?? "",
    vendor: deal.vendor ?? deal.title ?? "",
    description: deal.description ?? "",
    distance: deal.distance ?? deal.location ?? "",
    validUntil: deal.validUntil ?? deal.valid_until ?? "",
    offerTag: deal.offerTag ?? deal.discount_label ?? deal.discountLabel ?? "",
    isTrending: deal.isTrending ? "1" : "0",
    imageUrl: deal.imageUrl ?? deal.image_url ?? "",
    imageKey: deal.imageKey ?? "food-bowl",
  });
}

export function providerProfileParams(business, role) {
  return withMarketplaceRole(role, {
    id: business.id != null ? String(business.id) : "",
    vendor: business.name ?? business.vendor ?? "Local Business",
    service: business.category ?? business.service ?? "",
    distance: business.distance ?? "",
  });
}

export function listingDetailParams(listing, role) {
  return withMarketplaceRole(role, {
    id: listing.id != null ? String(listing.id) : "",
  });
}

export function redeemCouponParams(coupon, role) {
  return withMarketplaceRole(role, {
    title: coupon.title ?? "",
    vendor: coupon.vendor ?? "",
  });
}
