import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { formatKmLabel, walkingMinutesFromMeters } from "../../constants/location-radius";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { callPlace, openPlaceDirections, telUrl } from "../../utils/open-place-actions";
import { sf, sw } from "../../utils/responsive";
import PlaceCategoryIcon from "./place-category-icon";

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function DetailRow({ icon, label, value, onPress }) {
  if (!value) return null;
  const content = (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Feather name={icon} size={sf(14)} color={T.deepTeal} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, onPress && styles.detailLink]}>{value}</Text>
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      {content}
    </TouchableOpacity>
  );
}

export default function NearbyPlaceDetails({ place }) {
  const { t } = useTranslation();
  const { showError } = useAppDialog();
  const canCall = Boolean(telUrl(place?.phone));
  const distance = place ? formatKmLabel(place.distanceMeters) : "";
  const walk = place ? walkingMinutesFromMeters(place.distanceMeters) : 0;
  const categoryLabel = place?.category
    ? t(`topBar.category${capitalize(place.category)}`, { defaultValue: formatTag(place.category) })
    : "";

  const onCall = async () => {
    try {
      await callPlace(place.phone);
    } catch (err) {
      await showError(
        t("topBar.unableToCall"),
        err?.code === "no-phone" ? t("topBar.noPhoneListed") : t("deals.callingNotSupported"),
      );
    }
  };

  const onDirections = async () => {
    try {
      await openPlaceDirections(place);
    } catch {
      await showError(t("topBar.unableToOpenMaps"), t("topBar.noMapLocation"));
    }
  };

  const openExternal = async (raw, fallbackTitle, fallbackBody) => {
    if (!raw) return;
    try {
      const url = /^https?:\/\//i.test(raw) || raw.startsWith("mailto:") ? raw : `https://${raw}`;
      await Linking.openURL(url);
    } catch {
      await showError(fallbackTitle, fallbackBody);
    }
  };

  if (!place) {
    return <Text style={styles.empty}>{t("topBar.noNearbyPlaces")}</Text>;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <PlaceCategoryIcon category={place.category} size="lg" />
        <View style={styles.heroCopy}>
          <Text style={styles.name}>{place.name}</Text>
          {categoryLabel ? <Text style={styles.category}>{categoryLabel}</Text> : null}
          {distance ? (
            <Text style={styles.distance}>
              {walk
                ? `${t("topBar.kmAway", { distance })} · ${t("topBar.minWalk", { count: walk })}`
                : t("topBar.kmAway", { distance })}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <DetailRow icon="tag" label={t("topBar.placeCategory")} value={categoryLabel} />
        <DetailRow icon="map-pin" label={t("topBar.placeAddress")} value={place.address} />
        <DetailRow
          icon="phone"
          label={t("topBar.placePhone")}
          value={place.phone || t("topBar.noPhoneListedShort")}
          onPress={canCall ? onCall : undefined}
        />
        <DetailRow
          icon="mail"
          label={t("topBar.placeEmail")}
          value={place.email}
          onPress={place.email ? () => openExternal(`mailto:${place.email}`, t("topBar.unableToOpenWebsite"), place.email) : undefined}
        />
        <DetailRow icon="clock" label={t("topBar.openingHours")} value={place.hours} />
        <DetailRow
          icon="globe"
          label={t("topBar.website")}
          value={place.website}
          onPress={place.website ? () => openExternal(place.website, t("topBar.unableToOpenWebsite"), t("topBar.noWebsiteListed")) : undefined}
        />
        <DetailRow icon="coffee" label={t("topBar.placeCuisine")} value={formatTag(place.cuisine)} />
        <DetailRow icon="award" label={t("topBar.placeBrand")} value={place.brand} />
        <DetailRow icon="briefcase" label={t("topBar.placeOperator")} value={place.operator} />
        <DetailRow icon="info" label={t("topBar.placeDescription")} value={place.description} />
        <DetailRow icon="users" label={t("topBar.placeAccessibility")} value={formatOsmFlag(place.wheelchair, t)} />
        <DetailRow icon="sun" label={t("topBar.placeOutdoorSeating")} value={formatOsmFlag(place.outdoorSeating, t)} />
        <DetailRow icon="shopping-bag" label={t("topBar.placeTakeaway")} value={formatOsmFlag(place.takeaway, t)} />
        <DetailRow icon="truck" label={t("topBar.placeDelivery")} value={formatOsmFlag(place.delivery, t)} />
        <DetailRow
          icon="share-2"
          label={t("topBar.placeFacebook")}
          value={place.facebook}
          onPress={place.facebook ? () => openExternal(place.facebook, t("topBar.unableToOpenWebsite"), place.facebook) : undefined}
        />
        <DetailRow
          icon="camera"
          label={t("topBar.placeInstagram")}
          value={place.instagram}
          onPress={place.instagram ? () => openExternal(place.instagram, t("topBar.unableToOpenWebsite"), place.instagram) : undefined}
        />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onCall} activeOpacity={0.85}>
          <Feather name="phone" size={sf(15)} color={T.white} />
          <Text style={styles.actionBtnText}>{t("topBar.call")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={onDirections}
          activeOpacity={0.85}
        >
          <Feather name="navigation" size={sf(15)} color={T.navy} />
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
            {t("topBar.directions")}
          </Text>
        </TouchableOpacity>
      </View>

      {place.website ? (
        <TouchableOpacity
          style={styles.websiteBtn}
          onPress={() => openExternal(place.website, t("topBar.unableToOpenWebsite"), t("topBar.noWebsiteListed"))}
          activeOpacity={0.85}
        >
          <Feather name="external-link" size={sf(15)} color={T.deepTeal} />
          <Text style={styles.websiteBtnText}>{t("topBar.openWebsite")}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: sw(32),
    flexGrow: 1,
  },
  empty: {
    marginTop: sw(24),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.gray,
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(14),
    marginTop: sw(4),
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    lineHeight: sf(28),
    color: T.navy,
  },
  category: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.gray,
  },
  distance: {
    marginTop: sw(4),
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: T.deepTeal,
  },
  card: {
    marginTop: sw(16),
    padding: sw(14),
    borderRadius: sw(16),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: T.border,
    gap: sw(14),
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
  },
  detailIcon: {
    width: sw(32),
    height: sw(32),
    borderRadius: sw(10),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: T.gray,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: T.navy,
  },
  detailLink: {
    color: T.deepTeal,
  },
  actionRow: {
    flexDirection: "row",
    gap: sw(8),
    marginTop: sw(16),
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    height: sw(46),
    borderRadius: sw(12),
    backgroundColor: T.teal,
  },
  actionBtnSecondary: {
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
  },
  actionBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: T.white,
  },
  actionBtnTextSecondary: {
    color: T.navy,
  },
  websiteBtn: {
    marginTop: sw(10),
    height: sw(46),
    borderRadius: sw(12),
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
  },
  websiteBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: T.deepTeal,
  },
});
