import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { getCurrentRole } from "../../constants/role-session";
import { listingCategoryLabel } from "../discover/category-picker";
import SuggestPlaceSheet from "../discover/suggest-place-sheet";
import SearchInput from "../ui/search-input";
import {
  fetchAdminEssentials,
  fetchEssentials,
} from "../../services/community-directory-api";
import { getCachedUser, subscribeSessionUser } from "../../services/auth-session";
import { isCommunityAdmin } from "../../services/community-access";
import { isResidentFeatureEnabled } from "../../constants/resident-features";
import { sf, sw } from "../../utils/responsive";

const DEFAULT_SECTION_KEYS = ["health", "burial", "parking", "clubs", "food"];

const SECTION_ICONS = {
  health: "pulse-outline",
  burial: "flower-outline",
  parking: "car-outline",
  clubs: "people-outline",
  food: "restaurant-outline",
  restaurants: "restaurant-outline",
  shopping: "bag-handle-outline",
  hospitals: "medical-outline",
  pharmacies: "medkit-outline",
};

export default function EssentialServicesPanel({ onRefreshParent }) {
  const { t } = useTranslation();
  const router = useRouter();
  const isAdmin = getCurrentRole() === "admin";
  const [sessionUser, setSessionUser] = useState(() => getCachedUser());
  const [payload, setPayload] = useState(null);
  const [adminPayload, setAdminPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);

  const nearbyEnabled = isResidentFeatureEnabled(sessionUser, "nearby_places");
  const creatingPlace = isCommunityAdmin(sessionUser);

  React.useEffect(() => subscribeSessionUser(setSessionUser), []);

  const sectionCopy = useMemo(
    () => ({
      health: { title: t("topBar.essentialHealth"), sub: t("topBar.essentialHealthListSub") },
      burial: { title: t("topBar.essentialBurial"), sub: t("topBar.essentialBurialListSub") },
      parking: { title: t("topBar.essentialParking"), sub: t("topBar.essentialParkingListSub") },
      clubs: { title: t("topBar.essentialClubs"), sub: t("topBar.essentialClubsListSub") },
      food: { title: t("topBar.essentialFood"), sub: t("topBar.essentialFoodListSub") },
    }),
    [t],
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      if (isAdmin) {
        const data = await fetchAdminEssentials();
        setAdminPayload(data);
      } else if (!nearbyEnabled) {
        setPayload(null);
      } else {
        const data = await fetchEssentials({ includePlaces: false });
        setPayload(data);
      }
    } catch (err) {
      setError(err?.message || t("topBar.nearbyLoadFailed"));
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, nearbyEnabled, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const displaySections = useMemo(() => {
    const fromApi = payload?.sections || [];
    const byKey = Object.fromEntries(fromApi.map((section) => [section.key, section]));
    const keys = [...DEFAULT_SECTION_KEYS];
    fromApi.forEach((section) => {
      if (section?.key && !keys.includes(section.key)) keys.push(section.key);
    });

    const needle = query.trim().toLowerCase();
    return keys
      .map((key) => {
        const row = byKey[key] || { key, label: "", entries: [] };
        const count = (row.entries || []).length;
        const title = sectionCopy[key]?.title || listingCategoryLabel(key, t, row.label);
        const sub = sectionCopy[key]?.sub || t("topBar.localListingsOnly");
        return { ...row, key, count, title, sub };
      })
      .filter((section) => {
        if (!needle) return true;
        return (
          section.title.toLowerCase().includes(needle)
          || section.sub.toLowerCase().includes(needle)
        );
      });
  }, [payload?.sections, query, sectionCopy, t]);

  const totalPublished = useMemo(
    () => displaySections.reduce((sum, section) => sum + section.count, 0),
    [displaySections],
  );

  function openSection(sectionKey) {
    router.push({
      pathname: "/screens/discover-essential",
      params: { section: sectionKey },
    });
  }

  if (!nearbyEnabled && !isAdmin) {
    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons name="layers-outline" size={sf(28)} color={PropertyHubTheme.teal} />
        </View>
        <Text style={styles.emptyTitle}>{t("topBar.essentialsEmptyTitle")}</Text>
        <Text style={styles.emptyBody}>{t("topBar.noEssentialCategories")}</Text>
      </View>
    );
  }

  if (loading && !payload && !adminPayload) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PropertyHubTheme.teal} />
        <Text style={styles.loadingText}>{t("topBar.discoverLoadingEssentials")}</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ silent: true }).then(() => onRefreshParent?.());
            }}
            tintColor={PropertyHubTheme.teal}
          />
        )}
      >
        <SearchInput
          placeholder={t("topBar.discoverSearchEssentials")}
          value={query}
          onChangeText={setQuery}
          imeSync={false}
          containerStyle={styles.search}
          placeholderTextColor="#9CA3AF"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isAdmin && adminPayload ? (
          <View style={styles.adminBlock}>
            <Text style={styles.adminHeading}>{t("topBar.pendingSuggestions")}</Text>
            {(adminPayload.suggestions || []).length === 0 ? (
              <Text style={styles.meta}>{t("topBar.noSuggestions")}</Text>
            ) : (
              (adminPayload.suggestions || []).map((item) => (
                <View key={item.id} style={styles.adminCard}>
                  <Text style={styles.adminTitle}>{item.name || t("topBar.reportUpdate")}</Text>
                  <Text style={styles.meta}>{item.status}</Text>
                </View>
              ))
            )}
            <Pressable
              style={styles.suggestBtn}
              onPress={() => setSuggestOpen(true)}
            >
              <Feather name="plus" size={sf(15)} color="#fff" />
              <Text style={styles.suggestBtnText}>{t("services.essentialServicesAdd")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.resourcesHeader}>
          <Text style={styles.resourcesTitle}>{t("topBar.communityResources")}</Text>
          <Text style={styles.resourcesSub}>
            {totalPublished > 0
              ? t("topBar.essentialServicesCount", { count: totalPublished })
              : t("topBar.communityResourcesSub")}
          </Text>
        </View>

        {totalPublished === 0 && displaySections.length > 0 ? (
          <View style={styles.emptyCardInline}>
            <Text style={styles.emptyBody}>{t("topBar.essentialsEmptyBody")}</Text>
            <Pressable style={styles.suggestOutline} onPress={() => setSuggestOpen(true)}>
              <Text style={styles.suggestOutlineText}>
                {creatingPlace ? t("topBar.createPlaceAction") : t("topBar.suggestServiceAction")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.listCard}>
          {displaySections.map((section, index) => (
            <Pressable
              key={section.key}
              style={[styles.resourceRow, index < displaySections.length - 1 && styles.resourceRowDivider]}
              onPress={() => openSection(section.key)}
              accessibilityRole="button"
            >
              <View style={styles.resourceIcon}>
                <Ionicons
                  name={SECTION_ICONS[section.key] || "grid-outline"}
                  size={sf(22)}
                  color={PropertyHubTheme.deepTeal}
                />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.resourceName} numberOfLines={1}>{section.title}</Text>
                <Text style={styles.resourceSub} numberOfLines={2}>{section.sub}</Text>
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.countBadge}>
                  {t("topBar.essentialServicesCount", { count: section.count })}
                </Text>
                <Feather name="chevron-right" size={sf(16)} color="#C5CDD6" />
              </View>
            </Pressable>
          ))}
        </View>

        {!isAdmin ? (
          <Pressable style={styles.suggestOutlineWide} onPress={() => setSuggestOpen(true)}>
            <Feather name="plus" size={sf(15)} color={PropertyHubTheme.deepTeal} />
            <Text style={styles.suggestOutlineTextDark}>
              {creatingPlace ? t("topBar.createPlaceAction") : t("topBar.suggestServiceAction")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <SuggestPlaceSheet
        visible={suggestOpen}
        mode="suggest"
        creating={creatingPlace}
        onClose={() => setSuggestOpen(false)}
        onSubmitted={() => {
          setSuggestOpen(false);
          void load({ silent: true });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: sw(16), paddingBottom: sw(32), paddingTop: sw(4) },
  search: { marginBottom: sw(12) },
  center: { alignItems: "center", paddingTop: sw(32), gap: 8 },
  loadingText: { fontFamily: Fonts.regular, fontSize: sf(13), color: T.gray },
  error: { color: "#B91C1C", fontFamily: Fonts.medium, marginBottom: 8 },
  resourcesHeader: { marginBottom: sw(10) },
  resourcesTitle: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  resourcesSub: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(12), color: T.gray },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
  },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  resourceRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  resourceIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: 12,
    backgroundColor: "#E8F4F3",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  resourceName: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  resourceSub: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), color: T.gray },
  rowMeta: { alignItems: "flex-end", gap: 4 },
  countBadge: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#64748B" },
  emptyCard: {
    marginHorizontal: sw(16),
    marginTop: sw(12),
    padding: sw(24),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  emptyCardInline: {
    marginBottom: sw(12),
    padding: sw(14),
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: T.border,
  },
  emptyIcon: {
    width: sw(52),
    height: sw(52),
    borderRadius: 14,
    backgroundColor: "#E8F4F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A", textAlign: "center" },
  emptyBody: { marginTop: 6, fontFamily: Fonts.regular, fontSize: sf(13), color: T.gray, textAlign: "center" },
  suggestOutline: {
    marginTop: 12,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: PropertyHubTheme.teal,
  },
  suggestOutlineText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: sf(13) },
  suggestOutlineWide: {
    marginTop: sw(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PropertyHubTheme.iconBorder,
    backgroundColor: "#fff",
  },
  suggestOutlineTextDark: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: PropertyHubTheme.deepTeal },
  adminBlock: { marginBottom: sw(16) },
  adminHeading: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#0F172A", marginBottom: 8 },
  adminCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    padding: 12,
    marginBottom: 8,
  },
  adminTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  meta: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(12), color: T.gray },
  suggestBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: PropertyHubTheme.teal,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestBtnText: { color: "#fff", fontFamily: Fonts.semiBold, fontSize: sf(13) },
});