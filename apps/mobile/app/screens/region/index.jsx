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
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { getCurrentRole } from "../../../constants/role-session";
import { saveRegionSelection } from "../../../services/auth-api";
import { fetchRegionsOnly } from "../../../services/regions-api";
import { getApiErrorMessage } from "../../../utils/auth-errors";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import SafeTop from "../../../components/layout/safe-top";

const SEARCH_DEBOUNCE_MS = 400;

export default function RegionScreen() {
  const router = useRouter();
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
  const { showError } = useAppDialog();

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

  useEffect(() => {
    const requestLocationPermission = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        await showError(
          "Location Permission",
          "Location access helps us suggest your nearest region.",
        );
      }
    };

    requestLocationPermission();
  }, []);

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
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenStatusBar style="dark" />
      <SafeTop color="#FFFFFF">
      <View style={styles.topSection}>
        <Text style={styles.title}>Choose Your Region</Text>
        <Text style={styles.subtitle}>
          {activeRole === "admin"
            ? "Select your region, then register your community for system admin approval"
            : "Select your area first, then pick your community"}
        </Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search regions…"
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {isSearchPending || refreshing ? (
            <ActivityIndicator size="small" color="#007BFF" />
          ) : searchText.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchText("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      </SafeTop>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text style={styles.stateText}>Loading regions…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#9CA3AF" />
          <Text style={styles.stateTitle}>Could not load regions</Text>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadRegions()}>
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
              onRefresh={() => loadRegions(true)}
              tintColor="#007BFF"
            />
          }
        >
          {showEmpty ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="map-outline" size={36} color="#C6CBD3" />
              <Text style={styles.stateTitle}>No regions found</Text>
              <Text style={styles.stateText}>
                {debouncedSearch
                  ? "Try a different search term."
                  : activeRole === "admin"
                    ? "No regions are available yet. You can request to add your community below."
                    : "No regions are available yet. Please contact your community admin or try again later."}
              </Text>
            </View>
          ) : (
            regions.map((region) => {
              const busy = selectingId === region.id;

              return (
                <TouchableOpacity
                  key={region.id}
                  style={[styles.card, busy && styles.cardBusy]}
                  activeOpacity={0.85}
                  disabled={Boolean(selectingId)}
                  onPress={() => handleRegionSelect(region)}
                >
                  <Image
                    source={require("../../../assets/images/region-card.png")}
                    style={{ width: 48, height: 48 }}
                  />

                  <View style={styles.cardTextWrap}>
                    <Text style={styles.cardTitle}>{region.title}</Text>
                    <Text style={styles.cardArea}>
                      {[region.area, region.state].filter(Boolean).join(" · ")}
                    </Text>
                    <Text style={styles.cardUsers}>{region.users}</Text>
                  </View>

                  {busy ? (
                    <ActivityIndicator size="small" color="#007BFF" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#C6CBD3" />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      <View style={styles.bottomSection}>
        {activeRole === "admin" ? (
          <>
            <Text style={styles.mutedText}>Don't see your community?</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.linkRow}
              onPress={() => router.push({
                pathname: "/screens/request-for-community",
                params: { role: activeRole },
              })}
            >
              <Text style={styles.blueLink}>Request to add it</Text>
              <Image
                source={require("../../../assets/images/next-arrow.png")}
                style={{ width: 16, height: 16 }}
              />
            </TouchableOpacity>
          </>
        ) : null}

        <View style={styles.inviteRow}>
          {activeRole !== "admin" ? (
            <>
              <Text style={[styles.mutedText, { color: "rgba(74, 85, 101, 1)" }]}>
                Have an invite code?{" "}
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push("/screens/invite-code")}
              >
                <Text style={styles.orangeLink}>Enter here</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topSection: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F5",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
  },
  searchWrap: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "rgba(249, 250, 251, 1)",
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
    paddingTop: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  stateTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "rgba(0, 0, 0, 1)",
    textAlign: "center",
  },
  stateText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#007BFF",
  },
  retryText: {
    fontFamily: Fonts.medium,
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
    borderColor: "rgba(243, 244, 246, 1)",
    borderRadius: 16,
    padding: 22,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  cardBusy: {
    opacity: 0.7,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  cardArea: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: "rgba(74, 85, 101, 1)",
  },
  cardUsers: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(106, 114, 130, 1)",
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: "#EEF1F5",
    paddingTop: 22,
    paddingBottom: 14,
    alignItems: "center",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  mutedText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(106, 114, 130, 1)",
  },
  blueLink: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(0, 124, 250, 1)",
    fontWeight: "600",
  },
  inviteRow: {
    marginTop: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  orangeLink: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(254, 154, 0, 1)",
    fontWeight: "700",
  },
});
