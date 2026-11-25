import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
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
  resolveViewerBillingAccess,
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
  return null;
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
  const canSubscribe = Boolean(isContact && (service.can_subscribe || service.unit_options?.some((row) => row.can_subscribe)));
  const canUnsubscribe = Boolean(
    isContact && (service.can_unsubscribe || service.unit_options?.some((row) => row.can_unsubscribe)),
  );

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

      {canSubscribe ? (
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

      {canUnsubscribe ? (
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

function UnitPickerModal({
  visible,
  mode,
  serviceName,
  options,
  selectedIds,
  onToggle,
  onClose,
  onConfirm,
  busy,
  t,
}) {
  const selectable = options.filter((row) => (mode === "subscribe" ? row.can_subscribe : row.can_unsubscribe));
  const allSelected = selectable.length > 0 && selectable.every((row) => selectedIds.includes(row.unit_id));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.modalTitle}>
                {mode === "subscribe"
                  ? t("services.availableServicesPickUnitsSubscribe", { defaultValue: "Choose units to subscribe" })
                  : t("services.availableServicesPickUnitsUnsubscribe", { defaultValue: "Choose units to unsubscribe" })}
              </Text>
              {serviceName ? (
                <Text style={styles.modalSub} numberOfLines={2}>{serviceName}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
              <Feather name="x" size={20} color="#64748B" />
            </Pressable>
          </View>

          <Text style={styles.modalBody}>
            {mode === "subscribe"
              ? t("services.availableServicesPickUnitsSubscribeBody", {
                  defaultValue: "Select one or more units. The service request is sent for each selected unit.",
                })
              : t("services.availableServicesPickUnitsUnsubscribeBody", {
                  defaultValue: "Select the units you want to remove from this service.",
                })}
          </Text>

          {selectable.length > 1 ? (
            <Pressable
              style={styles.selectAllRow}
              onPress={() => {
                if (allSelected) {
                  onToggle(null, []);
                } else {
                  onToggle(null, selectable.map((row) => row.unit_id));
                }
              }}
              disabled={busy}
            >
              <Text style={styles.selectAllText}>
                {allSelected
                  ? t("services.availableServicesClearSelection", { defaultValue: "Clear selection" })
                  : t("services.availableServicesSelectAll", { defaultValue: "Select all units" })}
              </Text>
            </Pressable>
          ) : null}

          <ScrollView style={{ maxHeight: sw(280) }} nestedScrollEnabled>
            {options.map((row) => {
              const enabled = mode === "subscribe" ? row.can_subscribe : row.can_unsubscribe;
              const selected = selectedIds.includes(row.unit_id);
              const status = statusMeta(row.status, t);
              return (
                <Pressable
                  key={row.unit_id}
                  disabled={!enabled || busy}
                  onPress={() => {
                    if (!enabled) return;
                    if (selected) {
                      onToggle(row.unit_id, selectedIds.filter((id) => id !== row.unit_id));
                    } else {
                      onToggle(row.unit_id, [...selectedIds, row.unit_id]);
                    }
                  }}
                  style={[
                    styles.unitRow,
                    selected && styles.unitRowOn,
                    !enabled && styles.unitRowDisabled,
                  ]}
                >
                  <View style={[styles.unitCheck, selected && styles.unitCheckOn]}>
                    {selected ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.unitNumber, !enabled && styles.unitNumberMuted]}>
                      {t("services.billingContact.unitLabel", { number: row.unit_number })}
                    </Text>
                    {!enabled && status ? (
                      <Text style={styles.unitMeta}>{status.label}</Text>
                    ) : !enabled ? (
                      <Text style={styles.unitMeta}>
                        {t("services.availableServicesUnitUnavailable", { defaultValue: "Not available for this action" })}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={[styles.primaryBtn, (busy || selectedIds.length === 0) && styles.disabled]}
            disabled={busy || selectedIds.length === 0}
            onPress={onConfirm}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>
                {mode === "subscribe"
                  ? t("services.availableServicesConfirmSubscribe", {
                      count: selectedIds.length,
                      defaultValue: "Subscribe for {{count}} units",
                    })
                  : t("services.availableServicesConfirmUnsubscribe", {
                      count: selectedIds.length,
                      defaultValue: "Unsubscribe {{count}} units",
                    })}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function AvailableServicesScreen() {
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [billingUnits, setBillingUnits] = useState([]);
  const [activeUnits, setActiveUnits] = useState([]);
  const [isContact, setIsContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [picker, setPicker] = useState(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);
  const headerSubtitle = useMemo(() => {
    const unitCount = Math.max(activeUnits.length, billingUnits.length);
    if (unitCount > 1) {
      return t("myUnits.count", { count: unitCount });
    }
    if (billingUnits.length === 1) {
      return t("services.billingContact.unitLabel", { number: billingUnits[0].unit_number });
    }
  if (activeUnits.length === 1) {
      return t("services.billingContact.unitLabel", { number: activeUnits[0].unit_number });
    }
    return t("services.availableServicesSub");
  }, [activeUnits, billingUnits, t]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [result, access] = await Promise.all([
        fetchPropertyServices(),
        resolveViewerBillingAccess(),
      ]);
      const units = Array.isArray(result.units) ? result.units : result.unit ? [result.unit] : [];
      setServices((result.services ?? []).filter((service) => service.application_type === "optional"));
      setActiveUnits(access.units || []);
      setBillingUnits(access.billingUnits?.length ? access.billingUnits : units);
      setIsContact(Boolean(access.isBillingContact));
      setContactName(access.contactName || result.unit?.billing_contact?.name || "");
    } catch (error) {
      showApiFailure(error, { title: t("services.availableServicesTitle") });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function unitOptionsFor(service, mode) {
    if (Array.isArray(service.unit_options) && service.unit_options.length > 0) {
      return service.unit_options;
    }
    return billingUnits.map((unit) => ({
      unit_id: unit.id,
      unit_number: unit.unit_number,
      status: service.unit_subscription?.status ?? null,
      can_subscribe: Boolean(service.can_subscribe),
      can_unsubscribe: Boolean(service.can_unsubscribe || service.unit_subscription?.status === "active"),
    })).filter((row) => (mode === "subscribe" ? row.can_subscribe : row.can_unsubscribe) || billingUnits.length <= 1);
  }

  function openPicker(service, mode) {
    const options = unitOptionsFor(service, mode);
    const eligible = options.filter((row) => (mode === "subscribe" ? row.can_subscribe : row.can_unsubscribe));
    const hasMultipleBillingUnits = billingUnits.length > 1 || options.length > 1;

    if (!hasMultipleBillingUnits) {
      const onlyId = eligible[0]?.unit_id ?? billingUnits[0]?.id ?? null;
      void runAction(service.id, mode, onlyId ? [onlyId] : []);
      return;
    }

    setSelectedUnitIds(mode === "unsubscribe" ? [] : eligible.map((row) => row.unit_id));
    setPicker({ service, mode, options });
  }

  async function runAction(serviceId, mode, unitIds) {
    const ids = (unitIds || []).filter(Boolean);
    if (ids.length === 0) {
      showApiFailure(new Error(t("services.availableServicesPickUnitsRequired", {
        defaultValue: "Select at least one unit.",
      })), { title: t("services.availableServicesTitle") });
      return;
    }

    setBusyId(serviceId);
    try {
      for (const unitId of ids) {
        if (mode === "subscribe") {
          await subscribeToPropertyService(serviceId, null, unitId);
        } else {
          await unsubscribeFromPropertyService(serviceId, unitId);
        }
      }
      setPicker(null);
      setSelectedUnitIds([]);
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
        subtitle={headerSubtitle}
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
                onSubscribe={() => openPicker(service, "subscribe")}
                onUnsubscribe={() => openPicker(service, "unsubscribe")}
                t={t}
              />
            ))
          )}
        </ScrollView>
      )}

      <UnitPickerModal
        visible={Boolean(picker)}
        mode={picker?.mode || "subscribe"}
        serviceName={picker?.service?.name}
        options={picker?.options || []}
        selectedIds={selectedUnitIds}
        onToggle={(_id, next) => setSelectedUnitIds(next)}
        onClose={() => {
          if (busyId) return;
          setPicker(null);
          setSelectedUnitIds([]);
        }}
        onConfirm={() => {
          if (!picker) return;
          void runAction(picker.service.id, picker.mode, selectedUnitIds);
        }}
        busy={busyId === picker?.service?.id}
        t={t}
      />
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    paddingHorizontal: sw(16),
    paddingTop: sw(16),
    paddingBottom: sw(28),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: PropertyHubTheme.text,
  },
  modalSub: {
    marginTop: sw(4),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: PropertyHubTheme.textMuted,
  },
  modalBody: {
    marginTop: sw(10),
    marginBottom: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: PropertyHubTheme.textMuted,
  },
  selectAllRow: {
    alignSelf: "flex-start",
    marginBottom: sw(8),
  },
  selectAllText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: PropertyHubTheme.deepTeal,
  },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    marginBottom: sw(8),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: PropertyHubTheme.border,
  },
  unitRowOn: {
    backgroundColor: PropertyHubTheme.mint,
    borderColor: "rgba(20, 184, 166, 0.45)",
  },
  unitRowDisabled: {
    opacity: 0.55,
  },
  unitCheck: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(6),
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  unitCheckOn: {
    backgroundColor: PropertyHubTheme.teal,
    borderColor: PropertyHubTheme.teal,
  },
  unitNumber: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: PropertyHubTheme.text,
  },
  unitNumberMuted: {
    color: PropertyHubTheme.textMuted,
  },
  unitMeta: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: PropertyHubTheme.textMuted,
  },
};
