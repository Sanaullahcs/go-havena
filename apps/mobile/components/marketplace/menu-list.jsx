import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";

export function normalizeMenuItems(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : (() => {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  return list
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { name: item.trim(), price: "", section: "" };
      }
      const name = String(item.name ?? item.title ?? "").trim();
      if (!name) return null;
      return {
        name,
        price: String(item.price ?? item.amount ?? "").trim(),
        section: String(item.section ?? item.category ?? "").trim(),
      };
    })
    .filter(Boolean);
}

export default function MenuList({ items, title, note }) {
  const rows = normalizeMenuItems(items);
  if (!rows.length) return null;

  let lastSection = "";

  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {rows.map((item, index) => {
        const showSection = item.section && item.section !== lastSection;
        if (item.section) lastSection = item.section;
        return (
          <View key={`${item.section}-${item.name}-${index}`}>
            {showSection ? <Text style={styles.section}>{item.section}</Text> : null}
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              {item.price ? <Text style={styles.price}>{item.price}</Text> : null}
            </View>
          </View>
        );
      })}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#0F172A",
    fontWeight: "700",
    marginBottom: 4,
  },
  section: {
    marginTop: 6,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: "#1B4F8A",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  name: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#0F172A",
    lineHeight: MarketplaceType.bodyMdLine,
  },
  price: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#047857",
    fontWeight: "700",
  },
  note: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#64748B",
    lineHeight: MarketplaceType.captionLine,
  },
});
