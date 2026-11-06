import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { HomeTheme as T } from "../../../constants/home-theme";
import { Fonts } from "../../../constants/font";
import { formatKmLabel } from "../../../constants/location-radius";
import { fetchEssentials } from "../../../services/community-directory-api";
import { listingCategoryLabel } from "../../../components/discover/category-picker";
import { setNearbyPlaceDraft } from "../../../services/nearby-place-draft";
import { sf, sw } from "../../../utils/responsive";

const GUIDANCE = {
  health: ["essentialHealthStep1", "essentialHealthStep2", "essentialHealthStep3"],
  burial: ["essentialBurialStep1", "essentialBurialStep2", "essentialBurialStep3"],
  parking: ["essentialParkingStep1", "essentialParkingStep2", "essentialParkingStep3"],
  clubs: ["essentialClubsStep1", "essentialClubsStep2", "essentialClubsStep3"],
};

function entryAsPlace(entry) {
  return {
    id: `essential-${entry.id}`,
    name: entry.title,
    category: entry.section,
    address: entry.address || null,
    phone: entry.phone || null,
    description: entry.description || entry.body || null,
    latitude: entry.latitude ?? null,
    longitude: entry.longitude ?? null,
    distanceMeters: Number(entry.distance_meters ?? 0),
    verified: Boolean(entry.verified),
    source: "community",
  };
}

export default function DiscoverEssentialScreen() {
  const { section } = useLocalSearchParams();
  const key = String(Array.isArray(section) ? section[0] : section || "health");
  const { t } = useTranslation();
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    fetchEssentials({ includePlaces: false })
      .then((data) => { if (active) setPayload(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  const current = useMemo(
    () => (payload?.sections || []).find((item) => item.key === key) || { entries: [] },
    [payload, key],
  );
  const title = listingCategoryLabel(key, t, current.label);

  return (
    <View style={styles.screen}>
      <InternalScreenHeader title={title} subtitle={t("topBar.localListingsOnly")} compact dense />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={T.teal} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {(GUIDANCE[key] || []).map((step, index) => (
            <View key={step} style={styles.step}>
              <Text style={styles.stepTitle}>{index + 1}. {t(`topBar.${step}Title`)}</Text>
              <Text style={styles.stepBody}>{t(`topBar.${step}Body`)}</Text>
            </View>
          ))}
          {current.entries.length === 0 ? <Text style={styles.stepBody}>{t("services.essentialServicesEmpty")}</Text> : null}
          {current.entries.map((entry) => {
            const place = entryAsPlace(entry);
            return (
              <Pressable
                key={entry.id}
                style={styles.card}
                onPress={() => {
                  setNearbyPlaceDraft(place);
                  router.push({ pathname: "/screens/nearby-place-detail", params: { id: place.id } });
                }}
              >
                <Text style={styles.cardTitle}>{entry.title}</Text>
                {entry.description || entry.body ? <Text style={styles.stepBody}>{entry.description || entry.body}</Text> : null}
                {place.distanceMeters ? (
                  <Text style={styles.stepBody}>
                    {formatKmLabel(place.distanceMeters)}
                  </Text>
                ) : null}
                {entry.phone ? (
                  <Pressable onPress={() => Linking.openURL(`tel:${entry.phone}`)}>
                    <Text style={styles.link}>{entry.phone}</Text>
                  </Pressable>
                ) : null}
                {entry.verified ? <Text style={styles.verified}>{t("topBar.verifiedByCommunity")}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { padding: sw(16), paddingBottom: sw(40) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  step: { marginBottom: sw(14) },
  stepTitle: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#0F172A" },
  stepBody: { marginTop: 4, fontFamily: Fonts.regular, fontSize: sf(13), color: "#475569", lineHeight: sf(19) },
  card: { backgroundColor: T.white, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 10 },
  cardTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  link: { marginTop: 6, fontFamily: Fonts.medium, color: T.deepTeal },
  verified: { marginTop: 6, fontFamily: Fonts.medium, fontSize: sf(12), color: T.deepTeal },
  placesTitle: { marginTop: sw(8), marginBottom: 8, fontFamily: Fonts.bold, fontSize: sf(18), color: "#0F172A" },
  place: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
});
