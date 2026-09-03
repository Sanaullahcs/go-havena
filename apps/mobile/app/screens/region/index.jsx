import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { MapPin } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getCurrentRole } from "../../../constants/role-session";
import { saveRegionSelection } from "../../../services/auth-api";
import { ionChevronForward, arrowForward } from "../../../utils/rtl";
import { fetchRegionsOnly } from "../../../services/regions-api";
import { getApiErrorMessage } from "../../../utils/auth-errors";
import BackButton from "../../../components/ui/back-button";
import { confirmLeaveOnboarding } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { HomeTheme as T } from "../../../constants/home-theme";

const SEARCH_DEBOUNCE_MS = 400;

export default function RegionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { role: roleParam } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();

  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectingId, setSelectingId] = useState(null);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const loadRegions = useCallback(
    async (silent = false) => {
      if (!hasLoadedOnce.current) {
        setLoading(true);
      } else if (!silent) {
        setRefreshing(true);
      }
      setError(null);

      try {
        const list = await fetchRegionsOnly(
          debouncedSearch ? { q: debouncedSearch } : {},
        );
        setRegions(list);
      } catch (err) {
        setError(getApiErrorMessage(err));
        setRegions([]);
      } finally {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch],
  );

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  const handleRegionSelect = async (region) => {
    if (selectingId) return;

    setSelectingId(region.id);
    try {
      await saveRegionSelection(region.id);
    } finally {
      setSelectingId(null);
    }

    router.push({
      pathname: "/screens/region/communities",
      params: {
        regionId: String(region.id),
        regionTitle: region.title,
        regionArea: region.area || "",
        regionState: region.state || "",
        role: activeRole,
      },
    });
  };

  const isSearchPending = searchText.trim() !== debouncedSearch;
  const showEmpty = !loading && !error && regions.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <View style={styles.topSection}>
        <View style={styles.headerRow}>
          <BackButton iconOnly compact onPress={() => confirmLeaveOnboarding(dialog)} />
          <Text style={styles.title} numberOfLines={1}>
            {t("region.chooseRegion")}
          </Text>
        </View>
        <Text style={styles.subtitle}>
          {activeRole === "admin"
            ? t("region.adminRegionHint")
            : t("region.residentRegionHint")}
        </Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={T.gray} />
          <LocaleTextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t("region.searchRegions")}
            placeholderTextColor={T.gray}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {isSearchPending || refreshing ? (
            <ActivityIndicator size="small" color={T.teal} />
          ) : searchText.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchText("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t("region.clearSearch")}
            >
              <Ionicons name="close-circle" size={18} color={T.gray} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={T.teal} />
          <Text style={styles.stateText}>{t("region.loadingRegions")}</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color={T.gray} />
          <Text style={styles.stateTitle}>{t("region.couldNotLoadRegions")}</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadRegions()}>
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
              onRefresh={() => loadRegions(true)}
              tintColor={T.teal}
            />
          }
        >
          {showEmpty ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <MapPin size={22} color={T.teal} strokeWidth={1.75} />
              </View>
              <Text style={styles.stateTitle}>{t("region.noRegionsFound")}</Text>
              <Text style={styles.stateText}>
                {debouncedSearch
                  ? t("region.tryDifferentSearch")
                  : activeRole === "admin"
                    ? t("region.noRegionsAdmin")
                    : t("region.noRegionsResident")}
              </Text>
            </View>
          ) : (
            regions.map((region) => {
              const busy = selectingId === region.id;

              return (
                <TouchableOpacity
                  key={region.id}
                  style={[styles.card, busy && styles.cardBusy]}
                  activeOpacity={0.88}
                  disabled={Boolean(selectingId)}
                  onPress={() => handleRegionSelect(region)}
                >
                  <View style={styles.iconWell}>
                    <MapPin size={16} color={T.navy} strokeWidth={1.75} />
                  </View>

                  <View style={styles.cardTextWrap}>
                    <Text style={styles.cardTitle}>{region.title}</Text>
                    <Text style={styles.cardArea}>
                      {[region.area, region.state].filter(Boolean).join(" · ")}
                    </Text>
                    {region.users ? (
                      <Text style={styles.cardUsers}>{region.users}</Text>
                    ) : null}
                  </View>

                  {busy ? (
                    <ActivityIndicator size="small" color={T.teal} />
                  ) : (
                    <View style={styles.chevronWrap}>
                      <Ionicons name={ionChevronForward()} size={16} color={T.navy} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom }]}>
        {activeRole === "admin" ? (
          <>
            <Text style={styles.mutedText}>{t("region.dontSeeCommunity")}</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.linkRow}
              onPress={() => router.push({
                pathname: "/screens/request-for-community",
                params: { role: activeRole },
              })}
            >
              <Text style={styles.tealLink}>{t("region.requestToAdd")}</Text>
              <Ionicons name={arrowForward()} size={14} color={T.teal} />
            </TouchableOpacity>
          </>
        ) : null}

        {activeRole !== "admin" ? (
          <View style={styles.inviteRow}>
            <Text style={styles.mutedText}>{t("region.haveInviteCode") + " "}</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push("/screens/invite-code")}
            >
              <Text style={styles.tealLink}>{t("region.enterHere")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
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
  },
  title: {
    flex: 1,
    minWidth: 0,
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
    maxWidth: 320,
  },
  searchWrap: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
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
    color: T.navy,
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
    paddingTop: 48,
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
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
  cardArea: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: T.gray,
  },
  cardUsers: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    color: T.deepTeal,
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
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 8,
    paddingHorizontal: 24,
    alignItems: "center",
    backgroundColor: T.canvas,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  mutedText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: T.gray,
  },
  tealLink: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: T.teal,
    fontWeight: "600",
  },
  inviteRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
});
