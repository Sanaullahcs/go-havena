/** Canonical marketplace stack routes (expo-router). */

export const MarketplaceRoutes = {
  HOME: "/(tabs)/marketplace",
  DEALS: "/marketplace/deals-offer",
  DEAL_DETAILS: "/marketplace/deal-details",
  MY_COUPONS: "/marketplace/my-coupons",
  REDEEM_COUPON: "/marketplace/redeem-coupon",
  CONFIRM_REDEEM: "/marketplace/confirm-redeem",
  ALL_BUSINESSES: "/marketplace/all-marketplace",
  MANAGE: "/marketplace/manage-marketplace",
  ADD_BUSINESS: "/marketplace/add-business",
  CREATE_DEAL: "/marketplace/create-deal",
  PROVIDER_PROFILE: "/marketplace/provider-profile",
  BUSINESS_DEALS: "/marketplace/business-deals",
  REVIEWS: "/marketplace/reviews",
  WRITE_REVIEW: "/marketplace/write-review",
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
