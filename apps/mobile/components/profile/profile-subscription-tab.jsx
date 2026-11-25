import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";

import { Fonts } from "../../constants/font";
import { Colors, Layout } from "../../constants/tokens";
import { getLocaleForLang } from "../../hooks/use-app-locale";
import { fetchAdminBilling, formatBillingDate, formatBillingMoney } from "../../services/billing-api";
import { sw, sf } from "../../utils/responsive";

function statusTone(status) {
  if (status === "active" || status === "trialing" || status === "paid") return "ok";
  if (status === "past_due" || status === "unpaid" || status === "open") return "warn";
  return "muted";
}

export default function ProfileSubscriptionTab() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = getLocaleForLang(i18n.language);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const data = await fetchAdminBilling();
      setBilling(data);
    } catch {
      setBilling(null);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sub = billing?.subscription ?? null;
  const next = billing?.next_charge ?? null;
  const invoices = billing?.invoices ?? [];
  const communityName = billing?.community?.name ?? "";
  const billingExempt = Boolean(
    billing?.billing?.exempt || billing?.seats?.billing_exempt || billing?.seats?.unlimited_seats,
  );
  const seatsUsed = billing?.seats?.seats_used ?? 0;

  const openInvoice = async (url) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      // Hosted invoice URL is Stripe-owned; ignore if the OS cannot open it.
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.brandPrimary} />
        <Text style={styles.loadingText}>{t("profile.subscription.loading")}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{t("profile.subscription.loadFailed")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>{t("profile.subscription.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brandPrimary} />
      }
    >
      {communityName ? (
        <Text style={styles.communityEyebrow}>{communityName}</Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>
          {billingExempt
            ? t("profile.subscription.regionAccess", { defaultValue: "Region access" })
            : t("profile.subscription.currentPlan")}
        </Text>
        {billingExempt ? (
          <>
            <Text style={styles.planName}>
              {t("profile.subscription.noSubscriptionRequired", { defaultValue: "No subscription required" })}
            </Text>
            <Text style={styles.cardMeta}>
              {t("profile.subscription.unlimitedSeatsUsed", {
                defaultValue: "{{used}} / Unlimited resident seats",
                used: seatsUsed,
              })}
            </Text>
            <Text style={styles.emptyBody}>
              {t("profile.subscription.exemptBody", {
                defaultValue: "Communities in this region do not need a plan or card.",
              })}
            </Text>
          </>
        ) : sub ? (
          <>
            <View style={styles.planRow}>
              <Text style={styles.planName}>{sub.plan_name}</Text>
              <View style={[styles.badge, styles[`badge_${statusTone(sub.status)}`]]}>
                <Text style={[styles.badgeText, styles[`badgeText_${statusTone(sub.status)}`]]}>
                  {t(`profile.subscription.status.${sub.status}`, { defaultValue: sub.status })}
                </Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>
              {t("profile.subscription.seats", { count: sub.seat_limit })}
              {"  ·  "}
              {sub.billing_interval === "year"
                ? t("profile.subscription.yearly")
                : t("profile.subscription.monthly")}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.emptyTitle}>{t("profile.subscription.noPlan")}</Text>
            <Text style={styles.emptyBody}>{t("profile.subscription.noPlanBody")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => router.push("/screens/complete-billing")}
            >
              <Text style={styles.retryText}>{t("profile.subscription.setupBilling")}</Text>
            </Pressable>
          </>
        )}
      </View>

      {sub && !billingExempt ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {next?.kind === "trial_ends" || next?.kind === "trial_starts"
              ? t("profile.subscription.planPrice")
              : t("profile.subscription.nextCharge")}
          </Text>
          <Text style={styles.planName}>
            {(next?.amount_cents ?? 0) > 0
              ? formatBillingMoney(next.amount_cents, next.currency)
              : t("profile.subscription.noCharge")}
          </Text>
          <Text style={styles.cardMeta}>
            {next?.kind === "trial_ends"
              ? t("profile.subscription.afterTrial", {
                  date: next?.at ? formatBillingDate(next.at, locale) : "—",
                })
              : next?.kind === "trial_starts"
                ? t("profile.subscription.afterTrialPending")
                : `${t(`profile.subscription.kind.${next?.kind ?? "renews"}`)}${
                    next?.at ? `  ·  ${formatBillingDate(next.at, locale)}` : ""
                  }`}
          </Text>
        </View>
      ) : null}

      {!billingExempt ? (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t("profile.subscription.invoices")}</Text>
        {invoices.length === 0 ? (
          <Text style={styles.emptyBody}>{t("profile.subscription.noInvoices")}</Text>
        ) : (
          invoices.map((invoice, index) => {
            const amount = invoice.status === "paid" ? invoice.amount_paid_cents : invoice.amount_due_cents;
            const url = invoice.hosted_invoice_url || invoice.invoice_pdf;
            return (
              <Pressable
                key={invoice.id || String(index)}
                disabled={!url}
                onPress={() => openInvoice(url)}
                style={[styles.invoiceRow, index === 0 && styles.invoiceRowFirst]}
              >
                <View style={styles.invoiceCopy}>
                  <Text style={styles.invoiceNumber}>
                    {invoice.number || t("profile.subscription.invoiceFallback")}
                  </Text>
                  <Text style={styles.invoiceMeta}>
                    {formatBillingDate(invoice.created_at, locale) || "—"}
                    {"  ·  "}
                    {t(`profile.subscription.invoiceStatus.${invoice.status}`, {
                      defaultValue: invoice.status,
                    })}
                  </Text>
                </View>
                <Text style={styles.invoiceAmount}>
                  {formatBillingMoney(amount, invoice.currency)}
                </Text>
                {url ? <Feather name="chevron-right" size={sf(16)} color={Colors.textMuted} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(8),
    paddingBottom: sw(28),
    gap: sw(12),
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPadding,
    gap: sw(10),
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textSecondary,
  },
  communityEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.brandPrimary,
    marginBottom: sw(2),
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius + 2,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: sw(16),
  },
  cardLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.textMuted,
    marginBottom: sw(8),
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(8),
  },
  planName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(20),
    lineHeight: sf(26),
    color: Colors.textPrimary,
  },
  cardMeta: {
    marginTop: sw(4),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: Colors.textSecondary,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
  },
  badge_ok: { backgroundColor: "#D1FAE5" },
  badge_warn: { backgroundColor: "#FEF3C7" },
  badge_muted: { backgroundColor: "#F1F5F9" },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    textTransform: "capitalize",
  },
  badgeText_ok: { color: "#047857" },
  badgeText_warn: { color: "#B45309" },
  badgeText_muted: { color: Colors.textSecondary },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  emptyBody: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: Colors.textSecondary,
  },
  retryBtn: {
    alignSelf: "flex-start",
    marginTop: sw(12),
    backgroundColor: Colors.brandPrimaryDeep,
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
  },
  retryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    paddingTop: sw(12),
    marginTop: sw(12),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  invoiceRowFirst: {
    marginTop: sw(4),
    paddingTop: sw(8),
    borderTopWidth: 0,
  },
  invoiceCopy: {
    flex: 1,
    minWidth: 0,
  },
  invoiceNumber: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  invoiceMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.textSecondary,
  },
  invoiceAmount: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
});
