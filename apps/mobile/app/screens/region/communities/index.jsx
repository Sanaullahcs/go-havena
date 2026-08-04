import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Fonts } from "../../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import BackButton from "../../../../components/ui/back-button";
import SafeTop from "../../../../components/layout/safe-top";
import { getCurrentRole } from "../../../../constants/role-session";
import { saveRegionSelection, joinCommunity } from "../../../../services/auth-api";
import { fetchCommunitiesInRegion } from "../../../../services/regions-api";
import { getApiErrorMessage } from "../../../../utils/auth-errors";
import { goToCompleteProfile } from "../../../../constants/onboarding-routes";
import { useApiAction } from "../../../../hooks/use-api-action";
import ScreenStatusBar from "../../../../components/layout/screen-status-bar";

const SEARCH_DEBOUNCE_MS = 400;

export default function RegionCommunitiesScreen() {
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
        setError("Region not found. Please go back and select a region.");
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
          await showFailure("Could not join community", err);
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

  const isSearchPending = searchText.trim() !== debouncedSearch;
  const showEmpty = !loading && !error && communities.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenStatusBar style="dark" />
      <SafeTop color="#FFFFFF">
      <View style={styles.headerBar}>
        <BackButton iconOnly compact />
      </View>
      </SafeTop>

      <View style={styles.topSection}>
        <View style={styles.regionBadge}>
          <Ionicons name="location" size={14} color="#14B8A6" />
          <Text style={styles.regionBadgeText}>{regionTitle}</Text>
        </View>
        <Text style={styles.title}>
          {isAdminOnboarding ? "Select Your Community" : "Select Your Community"}
        </Text>
        <Text style={styles.subtitle}>
          {isAdminOnboarding
            ? `Communities in ${regionTitle}. Select one without an admin, or request to add a new community.`
            : locationLabel
              ? `Communities in ${locationLabel}`
              : "Choose the community you belong to"}
        </Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search communities…"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {isSearchPending || refreshing ? (
            <ActivityIndicator size="small" color="#14B8A6" />
          ) : searchText.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchText("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#14B8A6" />
          <Text style={styles.stateText}>Loading communities…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#9CA3AF" />
          <Text style={styles.stateTitle}>Could not load communities</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadCommunities()}>
            <Text style={styles.retryText}>Try again</Text>
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
              tintColor="#14B8A6"
            />
          }
        >
          {showEmpty ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="business-outline" size={32} color="#94A3B8" />
              </View>
              <Text style={styles.stateTitle}>
                {isAdminOnboarding ? "No communities in this region" : "No communities yet"}
              </Text>
              <Text style={styles.stateText}>
                {isAdminOnboarding
                  ? `There are no communities listed in ${regionTitle} yet. Request to register a new one.`
                  : debouncedSearch
                    ? "Try a different search term."
                    : `There are no communities listed in ${regionTitle} yet. Contact your community admin if you need help.`}
              </Text>
              {isAdminOnboarding ? (
                <TouchableOpacity
                  style={styles.requestBtn}
                  onPress={() => router.push({
                    pathname: "/screens/request-for-community",
                    params: {
                      role: activeRole,
                      regionId: String(numericRegionId),
                      regionTitle: String(regionTitle),
                    },
                  })}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.requestBtnText}>Request to add community</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <>
              {isAdminOnboarding ? (
                <View style={styles.adminBanner}>
                  <Ionicons name="information-circle-outline" size={18} color="#14B8A6" />
                  <Text style={styles.adminBannerText}>
                    Communities with an admin are shown but cannot be selected. Choose an available community or request a new one.
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
                  activeOpacity={isDisabled ? 1 : 0.85}
                  disabled={Boolean(selectingId) || isDisabled}
                  onPress={() => handleCommunitySelect(community)}
                >
                  <View style={styles.communityIconWrap}>
                    <Ionicons
                      name="business-outline"
                      size={24}
                      color={isDisabled ? "#94A3B8" : "#14B8A6"}
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
                      <Text style={styles.cardBadge}>Community admin assigned</Text>
                    ) : null}
                  </View>

                  {busy ? (
                    <ActivityIndicator size="small" color="#14B8A6" />
                  ) : isDisabled ? (
                    <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#C6CBD3" />
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
          <Text style={styles.mutedText}>Don't see your community?</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({
              pathname: "/screens/request-for-community",
              params: {
                role: activeRole,
                regionId: String(numericRegionId),
                regionTitle: String(regionTitle),
              },
            })}
          >
            <Text style={styles.blueLink}>Request to add it in {regionTitle}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  headerBar: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  topSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
  regionBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#D1FAF5",
    marginBottom: 10,
  },
  regionBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#14B8A6",
    fontWeight: "600",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: "#000000",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 15,
    color: "#6A7282",
  },
  searchWrap: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    height: 52,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "rgba(10, 10, 10, 0.85)",
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
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#000000",
    textAlign: "center",
  },
  stateText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "#6A7282",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#14B8A6",
  },
  retryText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
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
    backgroundColor: "#14B8A6",
  },
  requestBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 14,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  card: {
    borderWidth: 2,
    borderColor: "#F3F4F6",
    borderRadius: 16,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  cardBusy: {
    opacity: 0.7,
  },
  communityIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: "#000000",
    fontWeight: "700",
  },
  cardTitleDisabled: {
    color: "#94A3B8",
  },
  cardArea: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: "#4A5565",
  },
  cardBadge: {
    marginTop: 6,
    fontFamily: Fonts.medium,
    fontSize: 10,
    lineHeight: 14,
    color: "#94A3B8",
  },
  cardDisabled: {
    opacity: 0.55,
  },
  adminBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    marginBottom: 4,
  },
  adminBannerText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#364155",
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
    paddingTop: 18,
    paddingBottom: 14,
    alignItems: "center",
  },
  mutedText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: "#6A7282",
  },
  blueLink: {
    marginTop: 6,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#007CFA",
    fontWeight: "600",
  },
});
