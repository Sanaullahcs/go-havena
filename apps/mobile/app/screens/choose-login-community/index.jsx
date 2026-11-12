import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { authLayoutStyles as layout } from "../../../constants/auth-layout";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import { openHomeAfterLogin } from "../../../constants/onboarding-routes";
import { useApiAction } from "../../../hooks/use-api-action";
import { getUser } from "../../../services/auth-session";
import { fetchMyCommunities, switchActiveCommunity } from "../../../services/profile-api";
import { sf, sw } from "../../../utils/responsive";
import { chevronForward } from "../../../utils/rtl";

function isEnterableCommunity(row) {
  if (String(row?.status || "").toLowerCase() !== "approved") return false;
  if (String(row?.role || "").toLowerCase() === "guest") return false;
  const community = row?.community;
  if (!community) return true;
  if (community.review_status === "pending" || community.review_status === "rejected") return false;
  if (community.status && community.status !== "active") return false;
  return true;
}

function communityLocation(community) {
  const address = String(community?.address ?? "").trim();
  const region = String(community?.region ?? "").trim();
  if (!address) return region;
  if (!region) return address;
  const addressLower = address.toLowerCase();
  const regionLower = region.toLowerCase();
  if (addressLower.includes(regionLower) || regionLower.includes(addressLower)) return address;
  return `${address} · ${region}`;
}

function communityInitial(name) {
  const text = String(name || "").trim();
  return text ? text.charAt(0).toUpperCase() : "C";
}

export default function ChooseLoginCommunityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showFailure } = useApiAction();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState(null);

  const enterApp = useCallback(
    async (user) => {
      const session = user ?? (await getUser());
      await openHomeAfterLogin(router, session);
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchMyCommunities();
        const communities = (payload.communities || []).filter(isEnterableCommunity);
        if (cancelled) return;
        if (communities.length < 2) {
          await enterApp();
          return;
        }
        setRows(communities);
      } catch (err) {
        if (!cancelled) {
          await showFailure(t("auth.chooseLoginCommunityTitle"), err);
          await enterApp();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enterApp, showFailure, t]);

  const choose = async (row) => {
    if (selectingId) return;
    const communityId = row.community_id;
    setSelectingId(communityId);
    try {
      const next = await switchActiveCommunity(communityId);
      await enterApp(next);
    } catch (err) {
      setSelectingId(null);
      await showFailure(t("auth.couldNotOpenCommunity"), err);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenStatusBar style="dark" opaque androidBackgroundColor={T.canvas} />
      <View style={styles.header}>
        <Text style={styles.kicker}>{t("auth.welcomeBackSuccess")}</Text>
        <Text style={layout.title}>{t("auth.chooseLoginCommunityTitle")}</Text>
        <Text style={layout.subtitle}>{t("auth.chooseLoginCommunityBody")}</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={T.navy} />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, sw(24)) }]}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => {
            const name = row.community?.name || t("community.myCommunity");
            const location = communityLocation(row.community);
            const selected = Number(selectingId) === Number(row.community_id);
            return (
              <TouchableOpacity
                key={row.id || row.community_id}
                activeOpacity={0.88}
                disabled={selectingId != null}
                onPress={() => choose(row)}
                accessibilityRole="button"
                accessibilityLabel={name}
                style={styles.card}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{communityInitial(name)}</Text>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {name}
                  </Text>
                  {location ? (
                    <View style={styles.metaRow}>
                      <View style={styles.metaIconWrap}>
                        <Feather name="map-pin" size={sf(12)} color={T.gray} />
                      </View>
                      <Text style={locationTextStyle} numberOfLines={2}>
                        {location}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {selected ? (
                  <ActivityIndicator color={T.navy} />
                ) : (
                  <Feather name={chevronForward()} size={sf(18)} color={T.navy} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: sw(20),
    paddingTop: sw(12),
    paddingBottom: sw(8),
  },
  kicker: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: T.deepTeal,
    marginBottom: 4,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: sw(20),
    paddingTop: sw(16),
    gap: sw(12),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    backgroundColor: T.white,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
  },
  avatar: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(22),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(20),
    color: T.navy,
  },
  copy: {
    flex: 1,
    gap: sw(4),
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: T.navy,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  metaIconWrap: {
    width: sw(16),
    height: sf(18),
    alignItems: "center",
    justifyContent: "center",
    marginRight: sw(4),
    flexShrink: 0,
  },
});

/** Plain object so the text-metrics patch cannot add font padding and drop the pin off the first line. */
const locationTextStyle = {
  flex: 1,
  fontFamily: Fonts.regular,
  fontSize: sf(12),
  lineHeight: sf(18),
  color: T.gray,
  includeFontPadding: false,
  textAlignVertical: "center",
  paddingTop: 0,
  paddingBottom: 0,
  margin: 0,
};
