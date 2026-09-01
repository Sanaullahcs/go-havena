import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import LocaleTextInput from "../../../../components/ui/locale-text-input";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { Building2, MapPin } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BackButton from "../../../../components/ui/back-button";
import { getCurrentRole } from "../../../../constants/role-session";
import { saveRegionSelection, joinCommunity } from "../../../../services/auth-api";
import { ionChevronForward } from "../../../../utils/rtl";
import { fetchCommunitiesInRegion } from "../../../../services/regions-api";
import { getApiErrorMessage } from "../../../../utils/auth-errors";
import { goToCompleteProfile } from "../../../../constants/onboarding-routes";
import { useApiAction } from "../../../../hooks/use-api-action";
import ScreenStatusBar from "../../../../components/layout/screen-status-bar";
import { HomeTheme as T } from "../../../../constants/home-theme";

const SEARCH_DEBOUNCE_MS = 400;

/** Inline so the StyleSheet text-metrics patch cannot add lineHeight (iOS top-aligns). */
const searchFieldTextStyle = {
  fontFamily: Fonts.regular,
  fontSize: 13,
  color: T.navy,
  paddingTop: 0,
  paddingBottom: 0,
  margin: 0,
  includeFontPadding: false,
};

export default function RegionCommunitiesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    regionId,
    regionTitle = "Region",
    regionArea = "",
    regionState = "",
    role: roleParam,
  } = useLocalSearchParams();

  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();

  const numericRegionId = Number(regionId);
  const locationLabel = [regionArea, regionState].filter(Boolean).join(" · ");

  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectingId, setSelectingId] = useState(null);
  const hasLoadedOnce = useRef(false);
  const { showFailure } = useApiAction();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const loadCommunities = useCallback(
    async (silent = false) => {
      if (!numericRegionId) {
        setError(t("region.regionNotFound"));
        setLoading(false);
        return;
      }

      if (!hasLoadedOnce.current) {
        setLoading(true);
      } else if (!silent) {
        setRefreshing(true);
      }
      setError(null);

      try {
        const list = await fetchCommunitiesInRegion({
          regionId: numericRegionId,
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
        });
        setCommunities(list);
      } catch (err) {
        setError(getApiErrorMessage(err));
        setCommunities([]);
      } finally {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [numericRegionId, debouncedSearch],
  );

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const isAdminOnboarding = activeRole === "admin";

  const handleCommunitySelect = async (community) => {
    if (selectingId || (isAdminOnboarding && community.hasAdmin)) return;

    setSelectingId(community.id);
    try {
      if (numericRegionId) {
        await saveRegionSelection(numericRegionId);
      }
      if (!isAdminOnboarding) {
        try {
          await joinCommunity(Number(community.id));
        } catch (err) {
          await showFailure(t("region.couldNotJoinCommunity"), err);
        }
      }
    } finally {
      setSelectingId(null);
    }

    goToCompleteProfile(router, {
      regionId: String(numericRegionId),
      role: activeRole,
      communityId: String(community.id),
      communityName: community.title,
    });
  };

  const goRequestCommunity = () => {
    router.push({
      pathname: "/screens/request-for-community",
      params: {
        role: activeRole,
        regionId: String(numericRegionId),
        regionTitle: String(regionTitle),
      },
    });
  };

  const isSearchPending = searchText.trim() !== debouncedSearch;
  const showEmpty = !loading && !error && communities.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />

      <View style={styles.topSection}>
        <View style={styles.headerRow}>
          <BackButton iconOnly compact />
          <View style={styles.regionBadge}>
            <MapPin size={12} color={T.teal} strokeWidth={2} />
            <Text style={styles.regionBadgeText} numberOfLines={1}>
              {regionTitle}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{t("region.selectCommunity")}</Text>
        <Text style={styles.subtitle}>
          {isAdminOnboarding
            ? t("region.adminCommunityHint", { region: regionTitle })
            : locationLabel
              ? t("region.residentCommunityHint", { location: locationLabel })
              : t("region.chooseCommunity")}
        </Text>

        <View style={styles.searchWrap}>
          <View style={styles.searchInner}>
            <Ionicons name="search-outline" size={18} color={T.gray} />
            <View style={styles.searchInputWrap}>
              <LocaleTextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={t("region.searchCommunities")}
                placeholderTextColor={T.gray}
                style={searchFieldTextStyle}
                returnKeyType="search"
                autoCorrect={false}
                underlineColorAndroid="transparent"
              />
            </View>
            {isSearchPending || refreshing ? (
              <ActivityIndicator size="small" color={T.teal} />
            ) : searchText.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchText("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={T.gray} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={T.teal} />
          <Text style={styles.stateText}>{t("region.loadingCommunities")}</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color={T.gray} />
          <Text style={styles.stateTitle}>{t("region.couldNotLoadCommunities")}</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadCommunities()}>
            <Text style={styles.retryText}>{t("region.tryAgain")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            showEmpty && styles.scrollContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadCommunities(true)}
              tintColor={T.teal}
            />
          }
        >
          {showEmpty ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Building2 size={22} color={T.teal} strokeWidth={1.75} />
              </View>
              <Text style={styles.stateTitle}>
                {isAdminOnboarding ? t("region.noCommunityAdmin") : t("region.noCommunityResident")}
              </Text>
              <Text style={styles.stateText}>
                {isAdminOnboarding
                  ? t("region.noCommunityAdminMsg", { region: regionTitle })
                  : debouncedSearch
                    ? t("region.tryDifferentSearch")
                    : t("region.noCommunityResidentMsg", { region: regionTitle })}
              </Text>
              {isAdminOnboarding ? (
                <TouchableOpacity style={styles.requestBtn} onPress={goRequestCommunity}>
                  <Ionicons name="add-circle-outline" size={18} color={T.white} />
                  <Text style={styles.requestBtnText}>{t("region.requestAddCommunity")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <>
              {isAdminOnboarding ? (
                <View style={styles.adminBanner}>
                  <Ionicons name="information-circle-outline" size={18} color={T.deepTeal} />
                  <Text style={styles.adminBannerText}>
                    {t("region.adminBanner")}
                  </Text>
                </View>
              ) : null}
              {communities.map((community) => {
                const busy = selectingId === community.id;
                const isDisabled = isAdminOnboarding && community.hasAdmin;

                return (
                  <TouchableOpacity
                    key={community.id}
                    style={[
                      styles.card,
                      busy && styles.cardBusy,
                      isDisabled && styles.cardDisabled,
                    ]}
                    activeOpacity={isDisabled ? 1 : 0.88}
                    disabled={Boolean(selectingId) || isDisabled}
                    onPress={() => handleCommunitySelect(community)}
                  >
                    <View style={[styles.communityIconWrap, isDisabled && styles.communityIconWrapDisabled]}>
                      <Building2
                        size={16}
                        color={isDisabled ? T.gray : T.navy}
                        strokeWidth={1.75}
                      />
                    </View>

                    <View style={styles.cardTextWrap}>
                      <Text style={[styles.cardTitle, isDisabled && styles.cardTitleDisabled]}>
                        {community.title}
                      </Text>
                      {community.area ? (
                        <Text style={styles.cardArea}>{community.area}</Text>
                      ) : null}
                      {isDisabled ? (
                        <Text style={styles.cardBadge}>{t("region.communityAdminAssigned")}</Text>
                      ) : null}
                    </View>

                    {busy ? (
                      <ActivityIndicator size="small" color={T.teal} />
                    ) : isDisabled ? (
                      <Ionicons name="lock-closed-outline" size={16} color={T.gray} />
                    ) : (
                      <View style={styles.chevronWrap}>
                        <Ionicons name={ionChevronForward()} size={16} color={T.navy} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {isAdminOnboarding && !loading && !error ? (
        <View style={styles.bottomSection}>
          <Text style={styles.mutedText}>{t("region.dontSeeCommunity")}</Text>
          <TouchableOpacity activeOpacity={0.8} onPress={goRequestCommunity}>
            <Text style={styles.tealLink}>{t("region.requestAddIn", { region: regionTitle })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  topSection: {
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  regionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.22)",
    flexShrink: 1,
    maxWidth: "100%",
  },
  regionBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: T.navy,
    fontWeight: "600",
    flexShrink: 1,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: T.navy,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 15,
    color: T.gray,
  },
  searchWrap: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    justifyContent: "center",
    paddingHorizontal: 16,
    height: 52,
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchInputWrap: {
    flex: 1,
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: T.navy,
    textAlign: "center",
  },
  stateText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: T.gray,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: T.navy,
  },
  retryText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.white,
    fontWeight: "600",
  },
  requestBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: T.navy,
  },
  requestBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.white,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 12,
    gap: 12,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(15, 61, 95, 0.12)",
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: T.white,
  },
  cardBusy: {
    opacity: 0.7,
  },
  communityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  communityIconWrapDisabled: {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
  },
  cardTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: T.navy,
    fontWeight: "700",
  },
  cardTitleDisabled: {
    color: T.gray,
  },
  cardArea: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: T.gray,
  },
  cardBadge: {
    marginTop: 6,
    fontFamily: Fonts.medium,
    fontSize: 10,
    lineHeight: 14,
    color: T.gray,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  chevronWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 8,
  },
  adminBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: T.mint,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.22)",
    marginBottom: 4,
  },
  adminBannerText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: T.navy,
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    backgroundColor: T.canvas,
  },
  mutedText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: T.gray,
  },
  tealLink: {
    marginTop: 6,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.teal,
    fontWeight: "600",
  },
});
