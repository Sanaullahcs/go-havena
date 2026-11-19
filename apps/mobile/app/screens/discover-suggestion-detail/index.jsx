import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { HomeTheme as T } from "../../../constants/home-theme";
import { Fonts } from "../../../constants/font";
import { listingCategoryLabel } from "../../../components/discover/category-picker";
import { fetchMyPlaceSuggestions } from "../../../services/community-directory-api";
import { getPlaceSuggestionDraft, setPlaceSuggestionDraft } from "../../../services/place-suggestion-draft";
import { useNow } from "../../../hooks/use-now";
import { statusBadgeStyle, statusLabel, suggestionSubtitle } from "../../../utils/discover-suggestion-display";
import { sf, sw } from "../../../utils/responsive";

const SECTION_ICONS = {
  health: "pulse-outline",
  burial: "flower-outline",
  parking: "car-outline",
  clubs: "people-outline",
  food: "restaurant-outline",
};

export default function DiscoverSuggestionDetailScreen() {
  const { id } = useLocalSearchParams();
  const suggestionId = String(Array.isArray(id) ? id[0] : id || "");
  const { t } = useTranslation();
  const now = useNow();
  const router = useRouter();
  const [item, setItem] = React.useState(() => {
    const draft = getPlaceSuggestionDraft();
    return draft && String(draft.id) === suggestionId ? draft : null;
  });
  const [loading, setLoading] = React.useState(!item);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchMyPlaceSuggestions();
      const found = rows.find((row) => String(row.id) === suggestionId);
      if (found) {
        setPlaceSuggestionDraft(found);
        setItem(found);
      }
    } finally {
      setLoading(false);
    }
  }, [suggestionId]);

  useFocusEffect(useCallback(() => {
    if (!item) void load();
  }, [item, load]));

  const sectionKey = item?.essential_section || item?.category || "parking";
  const badge = useMemo(
  () => (item ? statusBadgeStyle(statusLabel, item.status, t, styles) : null),
    [item, t],
  );

  const fields = useMemo(() => {
    if (!item) return [];
    const rows = [];
    const category = listingCategoryLabel(sectionKey, t, sectionKey);
    rows.push({ label: t("topBar.listingCategory"), value: category });
    if (item.address) rows.push({ label: t("topBar.suggestionDetailAddress"), value: item.address });
    if (item.phone) rows.push({ label: t("topBar.suggestionDetailPhone"), value: item.phone, tel: true });
    if (item.description) rows.push({ label: t("topBar.listingDescription"), value: item.description });
    if (item.note) rows.push({ label: t("topBar.suggestNote"), value: item.note });
    if (item.status === "rejected" && item.review_note) {
      rows.push({ label: t("topBar.suggestionReviewNote"), value: item.review_note });
    }
    return rows;
  }, [item, sectionKey, t]);

  return (
    <View style={styles.screen}>
      <InternalScreenHeader
        title={item?.name || t("topBar.yourSuggestions")}
        subtitle={t("topBar.suggestionDetailSub")}
        compact
        dense
      />
      {loading && !item ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : !item ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{t("common.error")}</Text>
          <Pressable style={styles.retry} onPress={() => router.back()}>
            <Text style={styles.retryText}>{t("common.back")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons
                name={SECTION_ICONS[sectionKey] || "location-outline"}
                size={sf(26)}
                color={T.deepTeal}
              />
            </View>
            <Text style={styles.heroTitle}>{item.name}</Text>
            <Text style={styles.heroMeta}>{suggestionSubtitle(item, t, now)}</Text>
            {badge ? (
              <View style={[badge.wrap, styles.heroBadge]}>
                <Text style={badge.text}>{badge.label}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            {fields.map((row, index) => (
              <View
                key={row.label}
                style={[styles.field, index < fields.length - 1 && styles.fieldDivider]}
              >
                <Text style={styles.fieldLabel}>{row.label}</Text>
                {row.tel ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${row.value}`)}>
                    <Text style={styles.fieldLink}>{row.value}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.fieldValue}>{row.value}</Text>
                )}
              </View>
            ))}
            {fields.length === 0 ? (
              <Text style={styles.fieldValue}>{t("topBar.suggestionDetailNoExtra")}</Text>
            ) : null}
          </View>

          <View style={styles.note}>
            <Feather name="info" size={sf(14)} color="#94A3B8" />
            <Text style={styles.noteText}>{t("topBar.suggestionsApprovalNote")}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FA" },
  scroll: { paddingHorizontal: sw(16), paddingBottom: sw(40) },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { fontFamily: Fonts.medium, fontSize: sf(14), color: T.gray },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.deepTeal,
  },
  retryText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: T.deepTeal },
  hero: {
    alignItems: "center",
    paddingVertical: sw(20),
    paddingHorizontal: sw(12),
    marginBottom: sw(12),
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF0",
  },
  heroIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(14),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(10),
  },
  heroTitle: { fontFamily: Fonts.bold, fontSize: sf(18), color: "#0B1220", textAlign: "center" },
  heroMeta: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#9CA3AF",
    textAlign: "center",
  },
  heroBadge: { marginTop: sw(12), flexDirection: "row", alignItems: "center", gap: 4 },
  card: {
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF0",
    overflow: "hidden",
    paddingHorizontal: sw(14),
  },
  field: { paddingVertical: sw(14) },
  fieldDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF1F4" },
  fieldLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#9CA3AF" },
  fieldValue: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(14), color: "#0B1220", lineHeight: sf(20) },
  fieldLink: { marginTop: 4, fontFamily: Fonts.semiBold, fontSize: sf(14), color: T.deepTeal },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: sw(16),
    paddingHorizontal: 2,
  },
  noteText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), color: "#94A3B8", lineHeight: sf(17) },
  badgePending: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFEDD5",
  },
  badgePendingText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#C2410C" },
  badgeApproved: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },
  badgeApprovedText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#15803D" },
  badgeRejected: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  },
  badgeRejectedText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#B91C1C" },
});
