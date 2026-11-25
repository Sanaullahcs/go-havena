/** Category visuals for external utility bills. Icons are MaterialCommunityIcons names. */
export const UTILITY_CATEGORIES = [
  { id: "electricity", icon: "lightning-bolt", color: "#D97706", bg: "#FFF7E6", border: "rgba(217, 119, 6, 0.24)" },
  { id: "gas", icon: "fire", color: "#EA580C", bg: "#FFF1E8", border: "rgba(234, 88, 12, 0.22)" },
  { id: "water", icon: "water", color: "#0284C7", bg: "#E0F2FE", border: "rgba(2, 132, 199, 0.22)" },
  { id: "internet", icon: "wifi", color: "#7C3AED", bg: "#F1EBFE", border: "rgba(124, 58, 237, 0.2)" },
];

export function utilityCategory(id) {
  return UTILITY_CATEGORIES.find((item) => item.id === id) ?? UTILITY_CATEGORIES[0];
}

export function billerInitials(biller) {
  const name = String(biller?.short_name || biller?.name || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
