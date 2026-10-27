import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Fonts } from "../../../../constants/font";
import { sf, sw } from "../../../../utils/responsive";
import { useApiAction } from "../../../../hooks/use-api-action";
import { showApiFailure } from "../../../../utils/auth-errors";
import {
  acceptBillingContactTransfer,
  cancelBillingContactTransfer,
  fetchMyUnits,
  rejectBillingContactTransfer,
  requestBillingContactTransfer,
  viewerIsBillingContact,
} from "../../../../services/property-services-api";
import { getUser } from "../../../../services/auth-session";

export default function BillingContactScreen() {
  const { t } = useTranslation();
  const { runAction } = useApiAction();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedByUnit, setSelectedByUnit] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [payload, user] = await Promise.all([
        fetchMyUnits(),
        getUser(),
      ]);
      const active = (payload.units || []).filter(
        (row) => (row.association_status || "active") === "active",
      );
      setUnits(active);
      setSelectedByUnit((current) => {
        const next = { ...current };
        for (const unit of active) {
          const key = String(unit.id);
          if (next[key] == null && unit.outgoing_transfer?.nominee?.id) {
            next[key] = unit.outgoing_transfer.nominee.id;
          }
          if (next[key] == null && viewerIsBillingContact(unit, user?.id)) {
            const firstNominee = (unit.residents || []).find((r) => !r.is_billing_contact);
            if (firstNominee?.id) next[key] = firstNominee.id;
          }
        }
        return next;
      });
    } catch (error) {
      showApiFailure(error, { title: t("services.billingContact.loadFailed") });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function withBusy(key, action) {
    setBusy(key);
    try {
      await action();
      await load({ silent: true });
    } finally {
      setBusy("");
    }
  }

  const headerSubtitle = useMemo(() => {
    if (units.length === 0) return undefined;
    if (units.length === 1) {
      return t("services.billingContact.unitLabel", { number: units[0].unit_number });
    }
    return t("services.billingContact.unitsCount", {
      count: units.length,
      defaultValue: "{{count}} units",
    });
  }, [t, units]);

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("services.billingContactTitle")}
        subtitle={headerSubtitle}
      />
      {loading && units.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0F766E" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load({ silent: true }); }}
              tintColor="#0F766E"
            />
          }
        >
          {units.length === 0 ? (
            <Text style={styles.hint}>{t("services.billingContact.emptyUnit")}</Text>
          ) : (
            units.map((unit) => (
              <UnitBillingSection
                key={unit.id}
                unit={unit}
                selectedId={selectedByUnit[String(unit.id)] ?? null}
                onSelectNominee={(nomineeId) => {
                  setSelectedByUnit((current) => ({
                    ...current,
                    [String(unit.id)]: nomineeId,
                  }));
                }}
                busy={busy}
                withBusy={withBusy}
                runAction={runAction}
                t={t}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function UnitBillingSection({
  unit,
  selectedId,
  onSelectNominee,
  busy,
  withBusy,
  runAction,
  t,
}) {
  const residents = unit?.residents ?? [];
  const nominees = useMemo(
    () => residents.filter((resident) => !resident.is_billing_contact),
    [residents],
  );
  const incoming = unit?.incoming_transfer;
  const outgoing = unit?.outgoing_transfer;
  const isContact = Boolean(unit?.is_billing_contact);
  const contactName = unit?.billing_contact?.name || t("services.billingContact.noContact");
  const unitKey = String(unit.id);

  return (
    <View style={styles.unitBlock}>
      <View style={styles.unitHeader}>
        <View style={styles.unitIcon}>
          <Feather name="home" size={sf(16)} color="#0F766E" />
        </View>
        <Text style={styles.unitTitle}>
          {t("services.billingContact.unitLabel", { number: unit.unit_number })}
        </Text>
        {isContact ? (
          <View style={styles.youBadge}>
            <Text style={styles.youBadgeText}>{t("services.billingContact.youBadge", { defaultValue: "You" })}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Feather name="user-check" size={sf(20)} color="#0F766E" />
        </View>
        <View style={styles.heroBody}>
          <Text style={styles.eyebrow}>{t("services.billingContact.currentTitle")}</Text>
          <Text style={styles.heroName}>{contactName}</Text>
          <Text style={styles.body}>
            {isContact
              ? t("services.billingContact.youAreContact")
              : unit.billing_contact
                ? t("services.billingContact.someoneElseContact", { name: contactName })
                : t("services.billingContact.noContact")}
          </Text>
        </View>
      </View>

      {incoming ? (
        <View style={[styles.card, styles.incomingCard]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("services.billingContact.pending")}</Text>
          </View>
          <Text style={styles.title}>{t("services.billingContact.incomingTitle")}</Text>
          <Text style={styles.body}>
            {t("services.billingContact.incomingBody", {
              name: incoming.requested_by?.name || contactName,
              unit: incoming.unit_number || unit.unit_number,
            })}
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.declineBtn, busy && styles.disabled]}
              disabled={Boolean(busy)}
              onPress={() => void withBusy(`reject-${unitKey}`, () => runAction({
                action: () => rejectBillingContactTransfer(incoming.id),
                successTitle: t("services.billingContact.declinedTitle"),
                successMessage: t("services.billingContact.declinedMessage"),
              }))}
            >
              {busy === `reject-${unitKey}` ? (
                <ActivityIndicator size="small" color="#B91C1C" />
              ) : (
                <>
                  <Feather name="x" size={sf(15)} color="#B91C1C" />
                  <Text style={styles.declineText}>{t("services.billingContact.decline")}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.acceptBtn, busy && styles.disabled]}
              disabled={Boolean(busy)}
              onPress={() => void withBusy(`accept-${unitKey}`, () => runAction({
                action: () => acceptBillingContactTransfer(incoming.id),
                successTitle: t("services.billingContact.acceptedTitle"),
                successMessage: t("services.billingContact.acceptedMessage"),
              }))}
            >
              {busy === `accept-${unitKey}` ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="check" size={sf(15)} color="#FFFFFF" />
                  <Text style={styles.acceptText}>{t("services.billingContact.accept")}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {isContact && outgoing ? (
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("services.billingContact.pending")}</Text>
          </View>
          <Text style={styles.title}>{t("services.billingContact.outgoingTitle")}</Text>
          <Text style={styles.body}>
            {t("services.billingContact.outgoingBody", { name: outgoing.nominee?.name || "" })}
          </Text>
          <Pressable
            style={[styles.withdrawBtn, busy && styles.disabled]}
            disabled={Boolean(busy)}
            onPress={() => void withBusy(`cancel-${unitKey}`, () => runAction({
              action: () => cancelBillingContactTransfer(outgoing.id),
              successTitle: t("services.billingContact.withdrawnTitle"),
              successMessage: t("services.billingContact.withdrawnMessage"),
            }))}
          >
            {busy === `cancel-${unitKey}` ? (
              <ActivityIndicator size="small" color="#0F766E" />
            ) : (
              <Text style={styles.withdrawText}>{t("services.billingContact.withdraw")}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {isContact && !outgoing ? (
        <View style={styles.card}>
          <Text style={styles.title}>{t("services.billingContact.chooseTitle")}</Text>
          <Text style={styles.body}>{t("services.billingContact.chooseHint")}</Text>
          {nominees.length === 0 ? (
            <Text style={styles.hint}>{t("services.billingContact.noOtherResidents")}</Text>
          ) : (
            nominees.map((resident) => {
              const selected = selectedId === resident.id;
              return (
                <Pressable
                  key={resident.id}
                  onPress={() => onSelectNominee(resident.id)}
                  style={[styles.residentRow, selected && styles.residentRowSelected]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(resident.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.residentName}>{resident.name}</Text>
                    {resident.email ? <Text style={styles.residentMeta}>{resident.email}</Text> : null}
                  </View>
                  {selected ? <Text style={styles.selectedLabel}>{t("services.billingContact.selected")}</Text> : null}
                </Pressable>
              );
            })
          )}
          {nominees.length > 0 ? (
            <Pressable
              style={[styles.sendBtn, (!selectedId || busy) && styles.disabled]}
              disabled={!selectedId || Boolean(busy)}
              onPress={() => {
                const nominee = nominees.find((item) => item.id === selectedId);
                return withBusy(`send-${unitKey}`, () => runAction({
                  action: () => requestBillingContactTransfer(selectedId, null, unit.id),
                  successTitle: t("services.billingContact.sentTitle"),
                  successMessage: t("services.billingContact.sentMessage", { name: nominee?.name || "" }),
                }));
              }}
            >
              {busy === `send-${unitKey}` ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendText}>{t("services.billingContact.sendRequest")}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!isContact && !incoming ? (
        <View style={styles.noteCard}>
          <Feather name="info" size={sf(14)} color="#0F766E" />
          <Text style={styles.noteText}>{t("services.billingContact.notContactHint")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function initials(name) {
  const parts = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

const styles = {
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
    gap: sw(18),
  },
  unitBlock: {
    gap: sw(10),
  },
  unitHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  unitIcon: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    alignItems: "center",
    justifyContent: "center",
  },
  unitTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#0F172A",
  },
  youBadge: {
    borderRadius: 999,
    backgroundColor: "#CCFBF1",
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  youBadgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#0F766E",
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(16),
  },
  heroIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroBody: {
    flex: 1,
    minWidth: 0,
    gap: sw(4),
  },
  heroName: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(24),
    color: "#0F172A",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: sw(16),
    gap: sw(8),
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
    backgroundColor: "#F0FDFA",
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#99F6E4",
    padding: sw(14),
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#475569",
  },
  incomingCard: {
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
  },
  eyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#475569",
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#64748B",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(3),
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#B45309",
  },
  actions: {
    flexDirection: "row",
    gap: sw(8),
    marginTop: sw(6),
  },
  acceptBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: sw(6),
  },
  acceptText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  declineBtn: {
    flex: 1,
    minHeight: sw(44),
    borderRadius: sw(12),
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: sw(6),
  },
  declineText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#B91C1C",
  },
  withdrawBtn: {
    marginTop: sw(4),
    minHeight: sw(42),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#99F6E4",
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#0F766E",
  },
  residentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    padding: sw(10),
    backgroundColor: "#FFFFFF",
  },
  residentRowSelected: {
    borderColor: "#5EEAD4",
    backgroundColor: "#F0FDFA",
  },
  avatar: {
    width: sw(36),
    height: sw(36),
    borderRadius: sw(18),
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#0F766E",
  },
  residentName: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#0F172A",
  },
  residentMeta: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    marginTop: 2,
  },
  selectedLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#0F766E",
  },
  sendBtn: {
    marginTop: sw(4),
    minHeight: sw(46),
    borderRadius: sw(12),
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFFFFF",
  },
  disabled: { opacity: 0.55 },
};
