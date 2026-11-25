import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/tokens";

const TAB_ICONS = {
  feed: { active: "home", inactive: "home-outline" },
  notices: { active: "notifications", inactive: "notifications-outline" },
  wellness: { active: "heart", inactive: "heart-outline" },
  marketplace: { active: "storefront", inactive: "storefront-outline" },
};

/** Vector tab icons — stay sharp at any DPI (no PNG tint blur). */
export default function TabBarIcon({ name, focused, size = 22 }) {
  const icons = TAB_ICONS[name];
  if (!icons) return null;

  return (
    <Ionicons
      name={focused ? icons.active : icons.inactive}
      size={size}
      color={focused ? Colors.brandPrimary : Colors.textMuted}
    />
  );
}
