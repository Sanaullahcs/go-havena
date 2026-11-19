/** US communities show distances in miles. Everywhere else stays metric. */
export function communityUsesMiles(community, user) {
  const code = String(user?.access?.country_code || "").trim().toUpperCase();
  if (code === "US") return true;
  if (code) return false;
  const currency = String(community?.currency || user?.currency || "").trim().toUpperCase();
  return currency === "USD";
}

/** Communities whose resident experience should open in Arabic. */
export function communityPrefersArabic(community) {
  if (!community) return false;
  if (String(community.currency || "").trim().toUpperCase() === "OMR") return true;
  const blob = `${community.name || ""} ${community.region || ""} ${community.address || ""}`;
  return /القرم|مسقط|عُمان|عمان/.test(blob);
}
