import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
} from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import UserAvatar from "../../../components/ui/user-avatar";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../../constants/font";
import { Colors, Layout, Shadows } from "../../../constants/tokens";
import { fetchNeighbor } from "../../../services/profile-api";
import { sw, sf } from "../../../utils/responsive";

function roleLabel(role, t) {
  if (role === "community_admin" || role === "admin") return t("profile.roles.admin");
  if (role === "guest") return t("profile.roles.guest");
  return t("profile.roles.resident");
}

function residenceLabel(type, t) {
  if (type === "homeowner") return t("residentProfile.homeowner");
  if (type === "tenant") return t("residentProfile.tenant");
  return null;
}

export default function ResidentProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { userId } = useLocalSearchParams();
  const [neighbor, setNeighbor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const avatarSize = useMemo(() => {
    if (width < 360) return sw(68);
    if (width > 420) return sw(84);
    return sw(76);
  }, [width]);

  const load = useCallback(async () => {
    if (!userId) {
      setError(t("residentProfile.profileUnavailable"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchNeighbor(userId);
      if (data?.is_mine) {
        router.replace("/(tabs)/profile");
        return;
      }
      setNeighbor(data);
    } catch (err) {
      setNeighbor(null);
      setError(err?.message || t("profile.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unitLine = neighbor?.unitNumber ? t("nav.unit", { number: neighbor.unitNumber }) : null;
  const residence = residenceLabel(neighbor?.residence_type, t);
  const chips = [
    { key: "role", label: roleLabel(neighbor?.role, t), tone: "brand" },
    residence ? { key: "residence", label: residence, tone: "neutral" } : null,
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader title={t("residentProfile.neighborProfile")} compact />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.brandPrimaryDeep} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={styles.errorIcon}>
            <Feather name="user-x" size={sf(28)} color="#94A3B8" />
          </View>
          <Text style={styles.errorTitle}>{t("residentProfile.profileUnavailable")}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : neighbor ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          <View style={styles.heroCard}>
            <View style={[styles.heroWash, { backgroundColor: "#F4F8FD" }]} />

            <View style={styles.identity}>
              <View style={[styles.avatarRing, { borderRadius: (avatarSize + sw(8)) / 2 }]}>
                <UserAvatar
                  source={neighbor.avatarUrl}
                  name={neighbor.displayName}
                  size={avatarSize}
                />
              </View>

              <Text style={styles.name} numberOfLines={2}>
                {neighbor.displayName}
              </Text>

              {chips.length ? (
                <View style={styles.chipRow}>
                  {chips.map((chip) => (
                    <View
                      key={chip.key}
                      style={[
                        styles.chip,
                        chip.tone === "brand" ? styles.chipBrand : styles.chipNeutral,
                      ]}
                    >
                      {chip.tone === "brand" ? <View style={styles.chipDot} /> : null}
                      <Text
                        style={[
                          styles.chipText,
                          chip.tone === "brand" ? styles.chipTextBrand : styles.chipTextNeutral,
                        ]}
                      >
                        {chip.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {neighbor.bio?.trim() ? (
                <Text style={styles.bio} numberOfLines={4}>
                  {neighbor.bio.trim()}
                </Text>
              ) : (
                <Text style={styles.bioEmpty}>{t("residentProfile.noBioYet")}</Text>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.placeRow}>
              <View style={styles.placeIcon}>
                <Feather name="map-pin" size={sf(16)} color={Colors.brandPrimaryDeep} />
              </View>
              <View style={styles.placeCopy}>
                <Text style={styles.placeEyebrow}>{t("residentProfile.communityLabel")}</Text>
                <Text style={styles.placeTitle} numberOfLines={1}>
                  {neighbor.communityName || t("community.yourCommunity")}
                </Text>
                {(unitLine || residence) ? (
                  <Text style={styles.placeMeta} numberOfLines={1}>
                    {[unitLine, residence].filter(Boolean).join("  ·  ")}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{t("residentProfile.aboutThisNeighbor")}</Text>
            <View style={styles.infoGrid}>
              <InfoTile
                icon="home"
                label={t("nav.home")}
                value={unitLine || t("residentProfile.unitNotShared")}
              />
              <InfoTile
                icon="users"
                label={t("residentProfile.role")}
                value={roleLabel(neighbor.role, t)}
              />
            </View>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function InfoTile({ icon, label, value }) {
  return (
    <View style={styles.infoTile}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={sf(14)} color={Colors.brandPrimaryDeep} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(4),
    paddingBottom: sw(24),
    gap: sw(10),
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(28),
    gap: sw(8),
  },
  errorIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(18),
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  errorTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: sw(6),
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: Layout.buttonRadius,
    backgroundColor: "#D1FAF5",
  },
  retryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: Colors.brandPrimaryDeep,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius + 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: "hidden",
    ...Shadows.card,
  },
  heroWash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  identity: {
    alignItems: "center",
    paddingTop: sw(14),
    paddingHorizontal: sw(14),
    paddingBottom: sw(2),
  },
  avatarRing: {
    padding: sw(3),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E9F3",
    marginBottom: sw(8),
  },
  name: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(18),
    lineHeight: sf(24),
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
    maxWidth: "100%",
    paddingHorizontal: sw(4),
  },
  chipRow: {
    marginTop: sw(6),
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: sw(6),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  chipBrand: {
    backgroundColor: "#D1FAF5",
  },
  chipNeutral: {
    backgroundColor: "#F1F5F9",
  },
  chipDot: {
    width: sw(6),
    height: sw(6),
    borderRadius: sw(3),
    backgroundColor: Colors.brandPrimaryDeep,
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(11),
  },
  chipTextBrand: {
    color: Colors.brandPrimaryDeep,
  },
  chipTextNeutral: {
    color: Colors.textBody,
  },
  bio: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textBody,
    textAlign: "center",
    maxWidth: "100%",
    paddingHorizontal: sw(4),
  },
  bioEmpty: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textMuted,
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0, 0, 0, 0.07)",
    marginHorizontal: sw(14),
    marginTop: sw(10),
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
  },
  placeIcon: {
    width: sw(38),
    height: sw(38),
    borderRadius: sw(11),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  placeCopy: {
    flex: 1,
    minWidth: 0,
  },
  placeEyebrow: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(10),
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
    marginBottom: sw(1),
  },
  placeTitle: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    lineHeight: sf(18),
    color: Colors.textPrimary,
  },
  placeMeta: {
    marginTop: sw(1),
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(12),
    lineHeight: sf(16),
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius + 2,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: sw(14),
  },
  infoTitle: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textPrimary,
    marginBottom: sw(10),
  },
  infoGrid: {
    flexDirection: "row",
    gap: sw(10),
  },
  infoTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  infoIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(8),
  },
  infoLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: Colors.textMuted,
    marginBottom: sw(2),
  },
  infoValue: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    lineHeight: sf(17),
    color: Colors.textPrimary,
  },
});
