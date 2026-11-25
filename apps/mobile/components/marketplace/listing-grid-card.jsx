import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { MarketplaceType } from "../../constants/marketplace-type";
import { getListingTypeTheme } from "../../constants/marketplace-theme";
import { formatCommunityMoney } from "../../utils/money";
import { mediaImageSource } from "../../utils/profile-display";
import { rnShadow } from "../../utils/shadow";
import { getLocaleForLang } from "../../hooks/use-app-locale";
import CrispImage from "../ui/crisp-image";
import ThemedIconBox from "../ui/themed-icon-box";

const CARD_RADIUS = 16;

export function formatListingPrice(price) {
  if (price == null || price === "") return i18n.t("marketplace.makeOfferPrice");
  const n = Number(price);
  if (Number.isNaN(n)) return i18n.t("marketplace.makeOfferPrice");
  if (n === 0) return i18n.t("marketplace.free");
  return formatCommunityMoney(n);
}

export function formatListingTimeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return i18n.t("marketplace.minsAgo", { count: Math.max(1, mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return i18n.t("marketplace.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t("marketplace.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString(getLocaleForLang(i18n.language), { month: "short", day: "numeric" });
}

export function listingCondition(item) {
  if (item.condition?.trim()) return item.condition.trim();
  return null;
}

export function listingDistance(item) {
  if (item.location?.trim()) {
    const loc = item.location.trim();
    if (/\d+\.?\d*\s*mi/i.test(loc)) return loc;
    return loc.length > 18 ? `${loc.slice(0, 18)}…` : loc;
  }
  return null;
}

/** Normalize API `images` (array, JSON string, or single path) to string URLs/paths. */
export function normalizeListingImages(images) {
  if (!images) return [];
  if (typeof images === "string") {
    const trimmed = images.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? normalizeListingImages(parsed) : [];
      } catch {
        return [];
      }
    }
    if (trimmed.includes("SQLSTATE") || trimmed.startsWith("{")) return [];
    return [trimmed];
  }
  if (!Array.isArray(images)) return [];
  return images
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object" && typeof entry.uri === "string") {
        return entry.uri.trim();
      }
      return "";
    })
    .filter((uri) => uri && !uri.includes("SQLSTATE") && !uri.startsWith("{"));
}

/** Raw first image path/URL — resolve at render with mediaImageSource / CrispImage. */
export function getListingImageUrl(item) {
  return normalizeListingImages(item?.images)[0] ?? null;
}

function resolveListingTheme(item) {
  const apiType = item?.type === "service" ? "service" : "item";
  return getListingTypeTheme(apiType);
}

function typeLabel(type) {
  if (type === "for_sale") return i18n.t("marketplace.forSale");
  if (type === "service") return i18n.t("marketplace.service");
  if (type === "deal") return i18n.t("marketplace.deal");
  return type ?? i18n.t("marketplace.listing");
}

export function listingTypeLabel(type) {
  return typeLabel(type);
}

function MediaPlaceholder({ theme, compact }) {
  return (
    <View style={[styles.mediaPlaceholder, { backgroundColor: theme.soft }, compact && styles.mediaPlaceholderCompact]}>
      <ThemedIconBox
        name={theme.feather}
        size={compact ? "sm" : "md"}
        color={theme.accent}
        backgroundColor="#FFFFFF"
      />
      <Text style={[styles.placeholderText, { color: theme.accent }]}>{i18n.t(theme.shortLabelKey ?? theme.shortLabel)}</Text>
    </View>
  );
}

function ListingMedia({ item, variant, theme }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = getListingImageUrl(item);
  const imageSource = imageUrl ? mediaImageSource(imageUrl) : null;
  const isList = variant === "list";
  const showImage = Boolean(imageSource) && !failed;
  const imageCount = normalizeListingImages(item?.images).length;

  return (
    <View style={[styles.mediaWrap, { backgroundColor: theme.soft }, isList && styles.mediaWrapList]}>
      {showImage ? (
        <CrispImage
          source={imageSource}
          style={styles.media}
          contentFit="cover"
          transition={200}
          onError={() => setFailed(true)}
        />
      ) : (
        <MediaPlaceholder theme={theme} compact={isList} />
      )}

      <View style={[styles.typeBadge, { backgroundColor: theme.accent }]}>
        <Ionicons
          name={item.type === "service" ? "construct-outline" : "pricetag-outline"}
          size={10}
          color="#FFFFFF"
        />
        <Text style={styles.typeBadgeText}>{i18n.t(theme.shortLabelKey ?? theme.shortLabel)}</Text>
      </View>

      {imageCount >= 2 ? (
        <View style={styles.photoBadge}>
          <Ionicons name="images-outline" size={10} color="#FFFFFF" />
          <Text style={styles.photoBadgeText}>{imageCount}</Text>
        </View>
      ) : null}

      {item.status === "pending" ? (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>{i18n.t("marketplace.pending")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SaveButton({ saved, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.heartBtn, style]}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={8}
    >
      <Ionicons
        name={saved ? "heart" : "heart-outline"}
        size={16}
        color={saved ? "#EF4444" : "#64748B"}
      />
    </TouchableOpacity>
  );
}

/**
 * Marketplace listing card — 2-column grid + list layout with item/service theming.
 */
export default function ListingGridCard({
  item,
  width,
  variant = "grid",
  onPress,
  onToggleSave,
}) {
  const isList = variant === "list";
  const theme = resolveListingTheme(item);
  const timeAgo = formatListingTimeAgo(item.created_at);
  const condition = listingCondition(item);
  const category = item.category?.trim();
  const location = listingDistance(item);
  const metaParts = [condition, location, timeAgo].filter(Boolean);

  return (
    <View
      style={[
        styles.cardFrame,
        { borderColor: theme.border },
        isList && styles.cardFrameList,
        width != null ? { width } : null,
        !isList && styles.cardFrameGrid,
      ]}
    >
      <Pressable
        onPress={() => onPress?.(item)}
        style={({ pressed }) => [
          styles.shell,
          isList && styles.shellList,
          pressed && styles.pressed,
        ]}
      >
        <View style={isList ? styles.listRow : null}>
          <ListingMedia item={item} variant={variant} theme={theme} />

          <View style={[styles.body, isList && styles.bodyList]}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.price, { color: theme.accent }]}>{formatListingPrice(item.price)}</Text>

            <View style={styles.infoRow}>
              {category ? (
                <View style={[styles.categoryChip, { backgroundColor: theme.soft }]}>
                  <Text style={[styles.categoryChipText, { color: theme.accent }]} numberOfLines={1}>
                    {category}
                  </Text>
                </View>
              ) : null}
              {metaParts.length > 0 ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {metaParts.join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <SaveButton
          saved={item.is_saved}
          onPress={() => onToggleSave?.(item)}
          style={isList ? styles.heartBtnList : undefined}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardFrame: {
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#64748B", offset: { width: 0, height: 2 }, opacity: 0.07, radius: 6 }),
      },
      android: { elevation: 2 },
    }),
  },
  cardFrameGrid: {
    marginBottom: 14,
  },
  cardFrameList: {
    marginBottom: 12,
    width: "100%",
  },
  shell: {
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    position: "relative",
  },
  shellList: {
    padding: 12,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    paddingEnd: 36,
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  mediaWrap: {
    width: "100%",
    aspectRatio: 1.05,
    position: "relative",
    overflow: "hidden",
    borderTopStartRadius: CARD_RADIUS,
    borderTopEndRadius: CARD_RADIUS,
  },
  mediaWrapList: {
    width: 108,
    height: 108,
    aspectRatio: undefined,
    borderRadius: 14,
    flexShrink: 0,
    borderTopStartRadius: 14,
    borderTopEndRadius: 14,
  },
  media: {
    width: "100%",
    height: "100%",
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mediaPlaceholderCompact: {
    minHeight: 108,
  },
  placeholderText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    fontWeight: "700",
  },
  typeBadge: {
    position: "absolute",
    top: 8,
    start: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  photoBadge: {
    position: "absolute",
    bottom: 8,
    end: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  photoBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    lineHeight: 12,
    color: "#FFFFFF",
  },
  pendingBadge: {
    position: "absolute",
    bottom: 8,
    start: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pendingText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: "#B45309",
    fontWeight: "700",
  },
  heartBtn: {
    position: "absolute",
    top: 8,
    end: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 1 }, opacity: 0.08, radius: 3 }),
      },
      android: { elevation: 2 },
    }),
  },
  heartBtnList: {
    top: 12,
    end: 12,
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 5,
  },
  bodyList: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    justifyContent: "center",
  },
  price: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.headingLine,
    fontWeight: "700",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#111827",
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  categoryChip: {
    maxWidth: "48%",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryChipText: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    fontWeight: "600",
  },
  meta: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "#94A3B8",
  },
});
