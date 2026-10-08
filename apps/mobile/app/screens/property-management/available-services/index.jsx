import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../../components/layout/internal-screen-header";
import { propertyStyles } from "../../../../constants/property-styles";
import { PropertyHubTheme } from "../../../../constants/property-management-theme";
import { Fonts } from "../../../../constants/font";
import { sf, sw } from "../../../../utils/responsive";
import { rnShadow } from "../../../../utils/shadow";
import {
  fetchPropertyServices,
  serviceCategoryLabel,
  subscribeToPropertyService,
  unsubscribeFromPropertyService,
} from "../../../../services/property-services-api";
import { showApiFailure } from "../../../../utils/auth-errors";
import { formatCommunityMoney } from "../../../../utils/money";

const CATEGORY_ICON = {
  electricity: "zap",
  electrical_maintenance: "zap",
  water: "droplet",
  utilities: "droplet",
  internet: "wifi",
  waste: "trash-2",
  house_cleaning: "home",
  pest_control: "shield",
  plumbing: "settings",
  maintenance: "settings",
  ac_maintenance: "cloud",
  security: "lock",
  parking: "map-pin",
  other: "grid",
};

const CATEGORY_TONE = {
  electricity: { color: "#B45309", bg: "#FFFBEB", border: "rgba(180, 83, 9, 0.22)" },
  electrical_maintenance: { color: "#B45309", bg: "#FFFBEB", border: "rgba(180, 83, 9, 0.22)" },
  water: { color: "#0369A1", bg: "#E0F2FE", border: "rgba(3, 105, 161, 0.22)" },
  utilities: { color: "#0369A1", bg: "#E0F2FE", border: "rgba(3, 105, 161, 0.22)" },
  internet: { color: "#6D28D9", bg: "#EDE9FE", border: "rgba(109, 40, 217, 0.2)" },
  waste: { color: "#047857", bg: "#D1FAE5", border: "rgba(4, 120, 87, 0.2)" },
  house_cleaning: { color: PropertyHubTheme.teal, bg: PropertyHubTheme.mint, border: PropertyHubTheme.iconBorder },
  pest_control: { color: "#9A3412", bg: "#FFEDD5", border: "rgba(154, 52, 18, 0.2)" },
  plumbing: { color: "#1D4ED8", bg: "#DBEAFE", border: "rgba(29, 78, 216, 0.2)" },
  maintenance: { color: "#1D4ED8", bg: "#DBEAFE", border: "rgba(29, 78, 216, 0.2)" },
  ac_maintenance: { color: "#0E7490", bg: "#CFFAFE", border: "rgba(14, 116, 144, 0.22)" },
  security: { color: PropertyHubTheme.text, bg: "#E8F0F6", border: "rgba(27, 79, 138, 0.18)" },
  parking: { color: PropertyHubTheme.deepTeal, bg: PropertyHubTheme.mint, border: PropertyHubTheme.iconBorder },
};

function categoryTone(category) {
  return CATEGORY_TONE[category] || {
    color: PropertyHubTheme.teal,
    bg: PropertyHubTheme.mint,
    border: PropertyHubTheme.iconBorder,
  };
}

function formatAmount(amount) {
  if (amount == null || amount === "") return null;
  const value = Number(amount);
  if (Number.isNaN(value)) return String(amount);
  return formatCommunityMoney(value);
}

function frequencyLabel(frequency, t) {
  const key = String(frequency ?? "").replace("-", "_");
  if (!key) return null;
  const path = `services.availableServicesFrequency.${key}`;
  const translated = t(path);
  return translated === path ? key.replaceAll("_", " ") : translated;
}

function statusMeta(status, t) {
  if (!status) return null;
  const key = String(status).toLowerCase();
  if (key === "active") {
    return { label: t("services.availableServicesStatusActive"), tone: "success" };
  }
  if (key === "pending" || key === "pending_approval") {
    return { label: t("services.availableServicesStatusPending"), tone: "pending" };
  }
  return { label: t("services.availableServicesStatus", { status }), tone: "muted" };
}

function ExpandableServiceName({ name, t }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [width, setWidth] = useState(0);
  const label = String(name ?? "");

  function handleMeasure(event) {
    const next = event.nativeEvent.lines.length > 2;
    setOverflows((current) => (current === next ? current : next));
    if (!next) setExpanded((current) => (current ? false : current));
  }

  return (
    <View
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
    >
      {width > 0 ? (
        <Text
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.serviceName, styles.serviceNameMeasure, { width }]}
          onTextLayout={handleMeasure}
        >
          {label}
        </Text>
      ) : null}
      <Text style={styles.serviceName} numberOfLines={expanded ? undefined : 2}>
        {label}
      </Text>
      {overflows ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.nameToggleBtn}
        >
          <Text style={styles.nameToggle}>
            {expanded
              ? t("services.availableServicesShowLess")
              : t("services.availableServicesShowMore")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ServiceCard({ service, isContact, busy, onSubscribe, onUnsubscribe, t }) {
  const category = String(service.category ?? "other");
  const tone = categoryTone(category);
  const amount = formatAmount(service.amount);
  const frequency = frequencyLabel(service.billing_frequency, t);
  const status = statusMeta(service.unit_subscription?.status, t);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWell, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Feather name={CATEGORY_ICON[category] || "grid"} size={sf(18)} color={tone.color} />
        </View>
        <View style={styles.headerCopy}>
          <ExpandableServiceName name={service.name} t={t} />
          <Text style={styles.categoryLabel} numberOfLines={1}>{serviceCategoryLabel(category)}</Text>
        </View>
        {status ? (
          <View style={[styles.statusBadge, styles[`status_${status.tone}`]]}>
            <Text style={[styles.statusText, styles[`statusText_${status.tone}`]]}>{status.label}</Text>
          </View>
        ) : null}
      </View>

      {(amount || frequency) ? (
        <View style={styles.chips}>
          {amount ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{amount}</Text>
            </View>
          ) : null}
          {frequency ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{frequency}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isContact && service.can_subscribe ? (
        <Pressable
          style={[styles.primaryBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={onSubscribe}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>{t("services.availableServicesSubscribe")}</Text>
          )}
        </Pressable>
      ) : null}

      {isContact && service.unit_subscription?.status === "active" ? (
        <Pressable
          style={[styles.secondaryBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={onUnsubscribe}
        >
          {busy ? (
            <ActivityIndicator size="small" color={PropertyHubTheme.dangerText} />
          ) : (
            <Text style={styles.secondaryText}>{t("services.availableServicesUnsubscribe")}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AvailableServicesScreen() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [isContact, setIsContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchPropertyServices();
      setServices((result.services ?? []).filter((service) => service.application_type === "optional"));
      setIsContact(Boolean(result.unit?.is_billing_contact));
      setContactName(result.unit?.billing_contact?.name || "");
      setUnitNumber(result.unit?.unit_number || "");
    } catch (error) {
      showApiFailure(error, { title: t("services.availableServicesTitle") });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleSubscribe(id) {
    setBusyId(id);
    try {
      await subscribeToPropertyService(id);
      await load({ silent: true });
    } catch (error) {
      showApiFailure(error, { title: t("services.availableServicesTitle") });
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnsubscribe(id) {
    setBusyId(id);
    try {
      await unsubscribeFromPropertyService(id);
      await load({ silent: true });
    } catch (error) {
      showApiFailure(error, { title: t("services.availableServicesTitle") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.availableServicesTitle")}
        subtitle={unitNumber ? t("services.billingContact.unitLabel", { number: unitNumber }) : t("services.availableServicesSub")}
      />
      {loading && services.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PropertyHubTheme.teal} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load({ silent: true }); }}
              tintColor={PropertyHubTheme.teal}
            />
          }
        >
          {!isContact ? (
            <View style={styles.noteCard}>
              <Feather name="info" size={sf(14)} color={PropertyHubTheme.pendingText} />
              <Text style={styles.noteText}>
                {contactName
                  ? t("services.availableServicesAskNamed", { name: contactName })
                  : t("services.availableServicesAsk")}
              </Text>
            </View>
          ) : null}

          {services.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Feather name="grid" size={sf(22)} color={PropertyHubTheme.teal} />
              </View>
              <Text style={styles.emptyTitle}>{t("services.availableServicesEmptyTitle")}</Text>
              <Text style={styles.emptyBody}>{t("services.availableServicesEmptyBody")}</Text>
            </View>
          ) : (
            services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                isContact={isContact}
                busy={busyId === service.id}
                onSubscribe={() => void handleSubscribe(service.id)}
                onUnsubscribe={() => void handleUnsubscribe(service.id)}
                t={t}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = {
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
    gap: sw(12),
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: PropertyHubTheme.pendingBg,
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: PropertyHubTheme.pendingBorder,
    padding: sw(14),
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.alertTitle,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    paddingHorizontal: sw(20),
    paddingVertical: sw(28),
  },
  emptyIcon: {
    width: sw(48),
    height: sw(48),
    borderRadius: sw(14),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(12),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: PropertyHubTheme.text,
    textAlign: "center",
  },
  emptyBody: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.textMuted,
    textAlign: "center",
  },
  card: {
    backgroundColor: PropertyHubTheme.surface,
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
    padding: sw(16),
    ...rnShadow({ color: PropertyHubTheme.text, offset: { width: 0, height: 2 }, opacity: 0.04, radius: 8 }),
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  iconWell: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: sw(1),
  },
  serviceName: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(22),
    color: PropertyHubTheme.text,
  },
  serviceNameMeasure: {
    position: "absolute",
    opacity: 0,
    left: 0,
    top: 0,
  },
  nameToggleBtn: {
    alignSelf: "flex-start",
    marginTop: sw(2),
  },
  nameToggle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.deepTeal,
  },
  categoryLabel: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderWidth: 1,
    flexShrink: 0,
  },
  status_success: {
    backgroundColor: PropertyHubTheme.successBg,
    borderColor: PropertyHubTheme.successBorder,
  },
  status_pending: {
    backgroundColor: PropertyHubTheme.pendingBadgeBg,
    borderColor: PropertyHubTheme.pendingBorder,
  },
  status_muted: {
    backgroundColor: "#F8FAFC",
    borderColor: PropertyHubTheme.border,
  },
  statusText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  statusText_success: { color: PropertyHubTheme.successText },
  statusText_pending: { color: PropertyHubTheme.pendingText },
  statusText_muted: { color: PropertyHubTheme.textMuted },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
    marginTop: sw(14),
  },
  chip: {
    backgroundColor: PropertyHubTheme.mint,
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: PropertyHubTheme.deepTeal,
  },
  primaryBtn: {
    marginTop: sw(14),
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  secondaryBtn: {
    marginTop: sw(10),
    minHeight: sw(44),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: PropertyHubTheme.dangerBorder,
    backgroundColor: PropertyHubTheme.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: PropertyHubTheme.dangerText,
  },
  disabled: { opacity: 0.55 },
};
