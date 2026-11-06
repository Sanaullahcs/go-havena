import React, { useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../layout/screen-header";
import NearbyMap from "../discover/nearby-map";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { formatKmLabel } from "../../constants/location-radius";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { callPlace, openPlaceDirections, telUrl } from "../../utils/open-place-actions";
import { sf, sw } from "../../utils/responsive";
import PlaceCategoryIcon from "./place-category-icon";

function capitalize(value) {
  return String(value || "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function formatOsmFlag(value, t) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "yes" || normalized === "true" || normalized === "1") return t("topBar.osmYes");
  if (normalized === "no" || normalized === "false" || normalized === "0") return t("topBar.osmNo");
  if (normalized === "limited") return t("topBar.osmLimited");
  return String(value).replace(/_/g, " ");
}

function formatTag(value) {
  return String(value || "").replace(/_/g, " ").trim();
}

function serviceSummary(place, t) {
  const parts = [];
  if (formatOsmFlag(place.takeaway, t) === t("topBar.osmYes")) parts.push(t("topBar.takeawayAvailable"));
  if (formatOsmFlag(place.delivery, t) === t("topBar.osmYes")) parts.push(t("topBar.deliveryAvailable"));
  if (formatOsmFlag(place.outdoorSeating, t) === t("topBar.osmYes")) parts.push(t("topBar.placeOutdoorSeating"));
  return parts.join(" · ");
}

function FactRow({ icon, label, value, trailing }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Feather name={icon} size={sf(16)} color="#94A3B8" style={styles.factIcon} />
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
      {trailing}
    </View>
  );
}

export default function NearbyPlaceDetails({ place }) {
  const { t } = useTranslation();
  const { showError } = useAppDialog();
  const [menuOpen, setMenuOpen] = useState(false);
  const located = place;
  const canCall = Boolean(telUrl(located?.phone));
  const distance = located ? formatKmLabel(located.distanceMeters) : "";
  const categoryLabel = located?.category
    ? t(`topBar.category${capitalize(located.category)}`, { defaultValue: formatTag(located.category) })
    : "";
  const cuisine = formatTag(located?.cuisine);
  const subtitle = [categoryLabel, cuisine || located?.brand].filter(Boolean).join(" · ");
  const services = located ? serviceSummary(located, t) : "";
  const hasMap = Number.isFinite(Number(located?.latitude)) && Number.isFinite(Number(located?.longitude));
  const menuItems = [
    canCall ? { key: "call", label: t("topBar.call"), icon: "phone" } : null,
    located?.website ? { key: "web", label: t("topBar.openWebsite"), icon: "globe" } : null,
  ].filter(Boolean);

  const onCall = async () => {
    try {
      await callPlace(located.phone);
    } catch (err) {
      await showError(
        t("topBar.unableToCall"),
        err?.code === "no-phone" ? t("topBar.noPhoneListed") : t("deals.callingNotSupported"),
      );
    }
  };

  const onDirections = async () => {
    try {
      await openPlaceDirections(located);
    } catch {
      await showError(t("topBar.unableToOpenMaps"), t("topBar.noMapLocation"));
    }
  };

  const onViewMap = async () => {
    const lat = Number(located?.latitude);
    const lng = Number(located?.longitude);
    const query = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : [located?.name, located?.address].filter(Boolean).join(", ");
    if (!query) {
      await showError(t("topBar.unableToOpenMaps"), t("topBar.noMapLocation"));
      return;
    }
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
    } catch {
      await showError(t("topBar.unableToOpenMaps"), t("topBar.noMapLocation"));
    }
  };

  const openExternal = async (raw) => {
    if (!raw) return;
    try {
      const url = /^https?:\/\//i.test(raw) || raw.startsWith("mailto:") ? raw : `https://${raw}`;
      await Linking.openURL(url);
    } catch {
      await showError(t("topBar.unableToOpenWebsite"), raw);
    }
  };

  const onMenu = (key) => {
    setMenuOpen(false);
    if (key === "call") void onCall();
    if (key === "web") void openExternal(located.website);
  };

  if (!located) {
    return <Text style={styles.empty}>{t("topBar.noNearbyPlaces")}</Text>;
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t("topBar.placeDetail")}
        layout="inline"
        titleAlign="center"
        compact
        dense
        iconOnly
        padded
        right={menuItems.length ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            style={styles.more}
            accessibilityRole="button"
            accessibilityLabel={t("topBar.moreActions")}
          >
            <Feather name="more-vertical" size={sf(18)} color="#0F172A" />
          </Pressable>
        ) : null}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <PlaceCategoryIcon category={located.category} />
          <View style={styles.heroCopy}>
            <Text style={styles.name}>{located.name}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {distance ? (
              <View style={styles.away}>
                <Feather name="map-pin" size={sf(12)} color="#64748B" />
                <Text style={styles.awayText}>{t("topBar.kmAway", { distance })}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {hasMap ? (
          <View style={styles.mapWrap}>
            <NearbyMap latitude={located.latitude} longitude={located.longitude} places={[located]} height={sw(168)} />
            <Pressable style={styles.viewMap} onPress={onViewMap} accessibilityRole="button">
              <Feather name="map" size={sf(14)} color={T.deepTeal} />
              <Text style={styles.viewMapText}>{t("topBar.viewOnMap")}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.section}>{t("topBar.aboutThisPlace")}</Text>
        <FactRow
          icon="map-pin"
          label={t("topBar.placeAddress")}
          value={located.address}
          trailing={located.address ? (
            <Pressable
              onPress={() => Clipboard.setStringAsync(String(located.address))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("topBar.copyAddress")}
            >
              <Feather name="copy" size={sf(16)} color="#94A3B8" />
            </Pressable>
          ) : null}
        />
        <FactRow icon="coffee" label={t("topBar.placeCuisine")} value={cuisine} />
        <FactRow icon="shopping-bag" label={t("topBar.placeService")} value={services} />
        <FactRow icon="phone" label={t("topBar.placePhone")} value={located.phone} />
        <FactRow icon="clock" label={t("topBar.openingHours")} value={located.hours} />
        <FactRow icon="globe" label={t("topBar.website")} value={located.website} />
        <FactRow icon="mail" label={t("topBar.placeEmail")} value={located.email} />
        <FactRow icon="award" label={t("topBar.placeBrand")} value={located.brand} />
        <FactRow icon="info" label={t("topBar.placeDescription")} value={located.description} />
      </ScrollView>

      <View style={styles.footer}>
        {located.phone ? (
          <Pressable style={styles.call} onPress={onCall} accessibilityRole="button">
            <Feather name="phone" size={sf(16)} color={T.deepTeal} />
            <Text style={styles.callText}>{t("topBar.call")}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.directions} onPress={onDirections} accessibilityRole="button">
          <Feather name="navigation" size={sf(16)} color="#fff" />
          <Text style={styles.directionsText}>{t("topBar.getDirections")}</Text>
        </Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            {menuItems.map((item) => (
              <Pressable key={item.key} style={styles.menuItem} onPress={() => onMenu(item.key)}>
                <Feather name={item.icon} size={sf(16)} color="#0F172A" />
                <Text style={styles.menuText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: sw(16), paddingBottom: sw(24) },
  empty: { margin: sw(24), fontFamily: Fonts.regular, fontSize: sf(14), color: T.gray },
  more: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 14 },
  heroCopy: { flex: 1, minWidth: 0 },
  name: { fontFamily: Fonts.bold, fontSize: sf(22), color: "#0B1220" },
  subtitle: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(13), color: "#64748B" },
  away: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  awayText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  mapWrap: { borderRadius: 16, overflow: "hidden" },
  viewMap: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  viewMapText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: T.deepTeal },
  section: { marginTop: 20, marginBottom: 6, fontFamily: Fonts.bold, fontSize: sf(18), color: "#0B1220" },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  factIcon: { marginTop: 2 },
  factCopy: { flex: 1, minWidth: 0 },
  factLabel: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#94A3B8" },
  factValue: { marginTop: 2, fontFamily: Fonts.medium, fontSize: sf(14), lineHeight: sf(20), color: "#0F172A" },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: sw(16), paddingTop: 8, paddingBottom: sw(16), backgroundColor: "#fff" },
  call: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.deepTeal,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  callText: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: T.deepTeal },
  directions: { flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: T.deepTeal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  directionsText: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: "#fff" },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.25)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: sw(56), paddingRight: sw(12) },
  menuSheet: { minWidth: 180, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 6, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 44 },
  menuText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#0F172A" },
});
