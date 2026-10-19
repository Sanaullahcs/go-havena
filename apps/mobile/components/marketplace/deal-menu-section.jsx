import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import CrispImage from "../ui/crisp-image";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";

export default function DealMenuSection({ menuImageUrl, menuItems }) {
  const { t } = useTranslation();
  const items = Array.isArray(menuItems) ? menuItems.filter((item) => item?.name) : [];
  if (!menuImageUrl && items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("deals.menu")}</Text>
      {menuImageUrl ? (
        <CrispImage source={menuImageUrl} style={styles.menuImage} contentFit="contain" />
      ) : null}
      {items.map((item, index) => {
        const imageUrl = item.imageUrl ?? item.image_url;
        return (
          <View key={`${item.name}-${index}`} style={styles.itemCard}>
            {imageUrl ? (
              <CrispImage source={imageUrl} style={styles.itemThumb} contentFit="cover" />
            ) : null}
            <View style={styles.itemBody}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                {item.price ? <Text style={styles.itemPrice}>{item.price}</Text> : null}
              </View>
              {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    color: "#0F172A",
    fontWeight: "700",
  },
  menuImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  itemThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  itemName: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: "#111827",
    fontWeight: "700",
  },
  itemPrice: {
    flexShrink: 0,
    maxWidth: "42%",
    textAlign: "right",
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#0F766E",
  },
  itemDesc: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#475467",
  },
});
