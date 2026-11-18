import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Ionicons } from "@expo/vector-icons";
import { MapPin } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getCurrentRole } from "../../../constants/role-session";
import { saveRegionSelection } from "../../../services/auth-api";
import { ionChevronForward } from "../../../utils/rtl";
import { normalizeRegion } from "../../../services/regions-api";
import { prefetchCountries, findCityRegion } from "../../../services/geography-api";
import { getApiErrorMessage } from "../../../utils/auth-errors";
import BackButton from "../../../components/ui/back-button";
import RegionFilterSheet, {
  REGION_FILTER_KEYBOARD_BOTTOM_OFFSET,
} from "../../../components/ui/region-filter-sheet";
import { confirmLeaveOnboarding } from "../../../services/sign-out";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { HomeTheme as T } from "../../../constants/home-theme";

export default function RegionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { role: roleParam, joinAnother, returnTo } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();
  const isJoinAnother = joinAnother === "1" || joinAnother === true;

  const [countryFilter, setCountryFilter] = useState(null);
  const [stateFilter, setStateFilter] = useState(null);
  const [cityFilter, setCityFilter] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectingId, setSelectingId] = useState(null);
  const scrollRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const isResident = activeRole !== "admin";

  useEffect(() => {
    prefetchCountries();
  }, []);

  const handleApplyFilter = ({ country, state, city }) => {
    setCountryFilter(country);
    setStateFilter(state);
    setCityFilter(city);
    setError(null);
    if (!city?.name || !state?.id) {
      setPinned(null);
    }
  };

  useEffect(() => {
    if (!stateFilter?.id || !cityFilter?.name) {
      setPinned(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    findCityRegion({
      countryId: countryFilter?.id,
      stateId: stateFilter.id,
      city: cityFilter.name,
    })
      .then((row) => {
        if (!cancelled) {
          if (row) {
            setPinned(normalizeRegion(row));
            setError(null);
          } else {
            setPinned(null);
            setError(
              t("region.noRegionForCity", {
                defaultValue: "No communities are set up for this city yet. Try another city.",
              }),
            );
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPinned(null);
          setError(getApiErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [countryFilter?.id, stateFilter?.id, cityFilter?.name]);

  const handleRegionSelect = async (region) => {
    if (!region?.id || selectingId) return;

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
        ...(isJoinAnother ? { joinAnother: "1" } : {}),
        ...(returnTo ? { returnTo: String(returnTo) } : {}),
      },
    });
  };

  const cityName = pinned?.area || cityFilter?.name || "";
  const pathLabel = [stateFilter?.name || pinned?.state, countryFilter?.name || pinned?.countryName]
    .filter(Boolean)
    .join(" · ");

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <View style={[styles.hero, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerRow}>
          <BackButton
            iconOnly
            compact
            onPress={() => {
              if (isJoinAnother) {
                if (router.canGoBack?.()) router.back();
                else router.replace("/(tabs)/home");
                return;
              }
              confirmLeaveOnboarding(dialog);
            }}
          />
          <Text style={styles.kicker}>
            {isJoinAnother ? t("nav.joinAnotherCommunity") : t("region.findYourArea")}
          </Text>
        </View>
        <Text style={styles.heroTitle}>
          {isJoinAnother
            ? t("region.joinAnotherTitle")
            : isResident
              ? t("region.liveHere")
              : t("region.operateHere")}
        </Text>
        <Text style={styles.heroCopy}>
          {isJoinAnother
            ? t("region.joinAnotherHint")
            : isResident
              ? t("region.liveHereHint")
              : t("region.operateHereHint")}
        </Text>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bottomOffset={REGION_FILTER_KEYBOARD_BOTTOM_OFFSET}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View style={styles.card}>
          <RegionFilterSheet
            embedded
            country={countryFilter}
            state={stateFilter}
            city={cityFilter}
            onApply={handleApplyFilter}
            scrollRef={scrollRef}
            scrollOffsetRef={scrollOffsetRef}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {loading ? (
            <View style={styles.pinning}>
              <ActivityIndicator size="small" color={T.navy} />
              <Text style={styles.pinningText}>{t("region.pinningCity")}</Text>
            </View>
          ) : pinned ? (
            <TouchableOpacity
              style={styles.ticket}
              activeOpacity={0.88}
              disabled={Boolean(selectingId)}
              onPress={() => handleRegionSelect(pinned)}
            >
              <View style={styles.ticketPin}>
                <MapPin size={16} color={T.navy} strokeWidth={1.75} />
              </View>
              <View style={styles.ticketText}>
                <Text style={styles.ticketCity}>{cityName}</Text>
                <Text style={styles.ticketPath}>{pathLabel}</Text>
              </View>
              {selectingId === pinned.id ? (
                <ActivityIndicator size="small" color={T.navy} />
              ) : (
                <View style={styles.ticketCta}>
                  <Text style={styles.ticketCtaText}>{t("region.seeCommunities")}</Text>
                  <Ionicons name={ionChevronForward()} size={14} color={T.white} />
                </View>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {isResident ? (
          <View style={styles.inviteRow}>
            <Text style={styles.mutedText}>{t("region.haveInviteCode") + " "}</Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push("/screens/invite-code")}>
              <Text style={styles.tealLink}>{t("region.enterHere")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inviteRow}>
            <Text style={styles.mutedText}>{t("region.dontSeeCommunity") + " "}</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: "/screens/request-for-community",
                  params: { role: activeRole },
                })
              }
            >
              <Text style={styles.tealLink}>{t("region.requestToAdd")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  flex: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kicker: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: T.gray,
    fontWeight: "600",
  },
  heroTitle: {
    marginTop: 14,
    fontFamily: Fonts.bold,
    fontSize: 26,
    lineHeight: 30,
    color: T.navy,
    fontWeight: "700",
  },
  heroCopy: {
    marginTop: 8,
    maxWidth: 300,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: T.gray,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
  },
  card: {
    backgroundColor: T.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  errorText: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#DC2626",
  },
  pinning: {
    marginTop: 8,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  pinningText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: T.gray,
  },
  ticket: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: T.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ticketPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  ticketText: {
    flex: 1,
    minWidth: 0,
  },
  ticketCity: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: T.navy,
    fontWeight: "700",
  },
  ticketPath: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: T.gray,
  },
  ticketCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: T.navy,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ticketCtaText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: T.white,
    fontWeight: "600",
  },
  inviteRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  mutedText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: T.gray,
  },
  tealLink: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.teal,
    fontWeight: "600",
  },
});
