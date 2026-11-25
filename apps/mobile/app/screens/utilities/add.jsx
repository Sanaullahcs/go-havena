import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import Tap from "../../../components/ui/tap";
import { KuickpayColors } from "../../../components/payments/kuickpay-brand";
import BillerLogo from "../../../components/payments/biller-logo";
import { UTILITY_CATEGORIES, utilityCategory } from "../../../components/payments/utility-meta";
import { Fonts } from "../../../constants/font";
import { PropertyManagementRoutes } from "../../../constants/property-management-routes";
import { fetchUtilityBillers, linkUtilityAccount } from "../../../services/payments-api";
import { safeApiMessage } from "../../../services/api-client";
import { sf, sw } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";

const NAVY = "#1B4F8A";
const SUCCESS = "#047857";
const DANGER = "#B91C1C";

function groupDigits(value) {
  return value.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function StepTitle({ number, title, done }) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, done && styles.stepDotDone]}>
        {done ? (
          <Feather name="check" size={sf(11)} color="#FFFFFF" />
        ) : (
          <Text style={styles.stepNumber}>{number}</Text>
        )}
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

export default function AddUtilityAccountScreen() {
  const { serviceType: initialType } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const formRef = useRef(null);
  const nicknameRef = useRef(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [serviceType, setServiceType] = useState(
    UTILITY_CATEGORIES.some((c) => c.id === initialType) ? String(initialType) : "electricity",
  );
  const [billers, setBillers] = useState([]);
  const [loadedType, setLoadedType] = useState(null);
  const [query, setQuery] = useState("");
  const [biller, setBiller] = useState(null);
  const [reference, setReference] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [linked, setLinked] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchUtilityBillers(serviceType)
      .then((rows) => { if (alive) setBillers(rows); })
      .catch(() => { if (alive) setBillers([]); })
      .finally(() => { if (alive) setLoadedType(serviceType); });
    return () => { alive = false; };
  }, [serviceType]);
  const loadingBillers = loadedType !== serviceType;

  // Keep the field being typed into above the keyboard.
  useEffect(() => {
    const event = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(event, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), Platform.OS === "ios" ? 120 : 60);
    });
    return () => sub.remove();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return billers;
    return billers.filter((b) => `${b.name} ${b.short_name} ${b.region ?? ""}`.toLowerCase().includes(q));
  }, [billers, query]);

  const digits = reference.replace(/\D/g, "");
  const min = biller?.reference_min_length ?? 6;
  const max = biller?.reference_max_length ?? 18;
  const lengthOk = digits.length >= min && digits.length <= max;
  const category = utilityCategory(serviceType);

  function measureForm() {
    formRef.current?.measureInWindow?.((_x, y) => {
      if (Number.isFinite(y)) setKeyboardOffset(Math.max(0, Math.round(y)));
    });
  }

  function chooseType(id) {
    if (id === serviceType) return;
    void Haptics.selectionAsync().catch(() => {});
    setServiceType(id);
    setBiller(null);
    setQuery("");
    setReference("");
    setError(null);
  }

  function chooseBiller(item) {
    void Haptics.selectionAsync().catch(() => {});
    setBiller(item);
    setReference("");
    setError(null);
  }

  function updateReference(value) {
    const next = value.replace(/\D/g, "").slice(0, max);
    setReference(next);
    setError(null);
    if (biller && min === max && next.length === max && digits.length < max) {
      void Haptics.selectionAsync().catch(() => {});
    }
  }

  async function pasteReference() {
    const text = await Clipboard.getStringAsync().catch(() => "");
    const pasted = String(text || "").replace(/\D/g, "").slice(0, max);
    if (!pasted) return;
    setReference(pasted);
    setError(null);
    void Haptics.selectionAsync().catch(() => {});
  }

  async function verify() {
    if (!biller || !lengthOk || verifying) return;
    Keyboard.dismiss();
    setVerifying(true);
    setError(null);
    try {
      const account = await linkUtilityAccount({ billerId: biller.id, reference: digits, nickname: nickname.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setLinked(account);
    } catch (err) {
      const fieldMessage = err?.errors?.reference?.[0] || err?.errors?.utility_biller_id?.[0];
      setError(safeApiMessage(fieldMessage || err?.message) || t("utilities.verifyFailed"));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setVerifying(false);
    }
  }

  function startOver() {
    setLinked(null);
    setBiller(null);
    setReference("");
    setNickname("");
  }

  if (linked) {
    const bill = linked.current_bill;
    const unpaid = bill?.status === "unpaid";
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
        <InternalScreenHeader title={t("utilities.accountAdded")} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}><Feather name="check" size={sf(30)} color={SUCCESS} /></View>
            <Text style={styles.successTitle}>{t("utilities.verifiedTitle", { biller: linked.biller?.short_name })}</Text>
            <Text style={styles.successBody}>{t("utilities.verifiedBody")}</Text>
            <View style={styles.confirmRows}>
              <ConfirmRow label={t("utilities.consumerName")} value={linked.consumer_name} />
              <ConfirmRow label={biller?.reference_label || t("utilities.reference")} value={linked.masked_reference} />
              {bill ? <ConfirmRow label={bill.billing_month_label} value={unpaid ? bill.formatted_payable_amount : bill.status_label} strong={unpaid} /> : null}
            </View>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Tap
            onPress={() => router.dismissTo(PropertyManagementRoutes.UTILITIES)}
            style={styles.primaryBtn}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{unpaid ? t("utilities.viewAndPay") : t("payments.done")}</Text>
          </Tap>
          <Pressable onPress={startOver} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.linkText}>{t("utilities.addAnother")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <InternalScreenHeader title={t("utilities.addTitle")} subtitle={t("utilities.addSubtitle")} />
      <View ref={formRef} style={styles.flex} onLayout={measureForm} collapsable={false}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <StepTitle number={1} title={t("utilities.stepType")} done />
              <View style={styles.types}>
                {UTILITY_CATEGORIES.map((item) => {
                  const active = item.id === serviceType;
                  return (
                    <Tap
                      key={item.id}
                      onPress={() => chooseType(item.id)}
                      containerStyle={styles.typeCell}
                      style={[styles.type, active && { backgroundColor: item.bg, borderColor: item.color }]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t(`utilities.categories.${item.id}`)}
                    >
                      <View style={[styles.typeIcon, { backgroundColor: active ? "#FFFFFF" : item.bg }]}>
                        <MaterialCommunityIcons name={item.icon} size={sf(20)} color={item.color} />
                      </View>
                      <Text style={[styles.typeText, active && { color: item.color }]} numberOfLines={1}>
                        {t(`utilities.categories.${item.id}`)}
                      </Text>
                    </Tap>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <StepTitle number={2} title={t("utilities.stepProvider")} done={Boolean(biller)} />
              {biller ? (
                <Tap
                  onPress={() => { setBiller(null); setError(null); }}
                  style={[styles.billerRow, styles.billerSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={`${biller.name}, ${t("utilities.change")}`}
                >
                  <BillerLogo biller={biller} serviceType={serviceType} />
                  <View style={styles.flex}>
                    <Text style={styles.billerName} numberOfLines={1}>{biller.name}</Text>
                    {biller.region ? <Text style={styles.billerRegion} numberOfLines={1}>{biller.region}</Text> : null}
                  </View>
                  <View style={styles.changePill}>
                    <Text style={styles.changeText}>{t("utilities.change")}</Text>
                  </View>
                </Tap>
              ) : (
                <View style={styles.billerList}>
                  {billers.length > 6 ? (
                    <View style={styles.search}>
                      <Feather name="search" size={sf(15)} color={KuickpayColors.muted} />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t("utilities.searchProvider")}
                        placeholderTextColor="#94A3B8"
                        style={styles.searchInput}
                        autoCorrect={false}
                        returnKeyType="search"
                      />
                      {query ? (
                        <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button">
                          <Feather name="x-circle" size={sf(15)} color="#94A3B8" />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {loadingBillers ? (
                    <ActivityIndicator color={NAVY} style={styles.loader} />
                  ) : filtered.length === 0 ? (
                    <Text style={styles.hint}>{t("utilities.noProviders")}</Text>
                  ) : (
                    filtered.map((item) => (
                      <Tap
                        key={item.id}
                        onPress={() => chooseBiller(item)}
                        style={styles.billerRow}
                        accessibilityRole="button"
                        accessibilityLabel={item.name}
                      >
                        <BillerLogo biller={item} serviceType={serviceType} />
                        <View style={styles.flex}>
                          <Text style={styles.billerName} numberOfLines={1}>{item.name}</Text>
                          {item.region ? <Text style={styles.billerRegion} numberOfLines={1}>{item.region}</Text> : null}
                        </View>
                        <Feather name="chevron-right" size={sf(18)} color="#CBD5E1" />
                      </Tap>
                    ))
                  )}
                </View>
              )}
            </View>

            {biller ? (
              <View style={styles.card}>
                <StepTitle number={3} title={t("utilities.stepReference", { label: biller.reference_label })} done={lengthOk && !error} />
                <View style={[styles.inputWrap, error && styles.inputError, lengthOk && !error && styles.inputOk]}>
                  <MaterialCommunityIcons name="barcode" size={sf(20)} color={error ? DANGER : category.color} />
                  <TextInput
                    value={groupDigits(digits)}
                    onChangeText={updateReference}
                    placeholder={"0".repeat(Math.min(max, 14)).replace(/(\d{4})(?=\d)/g, "$1 ")}
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    style={styles.input}
                    maxLength={max + Math.floor(max / 4)}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={() => nicknameRef.current?.focus()}
                    accessibilityLabel={biller.reference_label}
                  />
                  {digits.length === 0 ? (
                    <Pressable onPress={() => void pasteReference()} hitSlop={8} style={styles.pasteBtn} accessibilityRole="button">
                      <Feather name="clipboard" size={sf(13)} color={NAVY} />
                      <Text style={styles.pasteText}>{t("utilities.paste")}</Text>
                    </Pressable>
                  ) : lengthOk && !error ? (
                    <Feather name="check-circle" size={sf(18)} color={SUCCESS} />
                  ) : (
                    <Text style={styles.counter}>{min === max ? `${digits.length}/${max}` : `${digits.length}`}</Text>
                  )}
                </View>
                {error ? (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={sf(14)} color={DANGER} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : biller.reference_hint ? (
                  <View style={styles.hintRow}>
                    <Feather name="info" size={sf(13)} color={KuickpayColors.muted} />
                    <Text style={[styles.hint, styles.flex]}>{biller.reference_hint}</Text>
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>{t("utilities.stepNickname")}</Text>
                <View style={styles.inputWrap}>
                  <Feather name="tag" size={sf(16)} color={KuickpayColors.muted} />
                  <TextInput
                    ref={nicknameRef}
                    value={nickname}
                    onChangeText={(value) => setNickname(value.slice(0, 60))}
                    placeholder={t("utilities.nicknamePlaceholder")}
                    placeholderTextColor="#94A3B8"
                    style={[styles.input, styles.inputText]}
                    returnKeyType="done"
                    onSubmitEditing={() => void verify()}
                  />
                </View>

                <View style={styles.privacy}>
                  <Feather name="shield" size={sf(14)} color={SUCCESS} />
                  <Text style={styles.privacyText}>{t("utilities.privacyNote")}</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {biller ? (
            <View style={styles.footer}>
              <Tap
                onPress={() => void verify()}
                disabled={!lengthOk || verifying}
                style={styles.primaryBtn}
                disabledStyle={styles.disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: !lengthOk || verifying, busy: verifying }}
              >
                {verifying ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.primaryText}>{t("utilities.verifying", { biller: biller.short_name })}</Text>
                  </>
                ) : (
                  <>
                    <Feather name="shield" size={sf(16)} color="#FFFFFF" />
                    <Text style={styles.primaryText}>{t("utilities.verifyAndAdd")}</Text>
                  </>
                )}
              </Tap>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function ConfirmRow({ label, value, strong }) {
  if (!value) return null;
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={[styles.confirmValue, strong && styles.confirmValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FB" },
  flex: { flex: 1 },
  content: { padding: sw(16), paddingBottom: sw(28), gap: sw(12) },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(20),
    padding: sw(16),
    gap: sw(12),
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.05, radius: 12, elevation: 2 }),
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  stepDot: {
    width: sw(22),
    height: sw(22),
    borderRadius: sw(11),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: SUCCESS },
  stepNumber: { fontFamily: Fonts.bold, fontSize: sf(11), color: NAVY, includeFontPadding: false },
  stepTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: sf(14), color: KuickpayColors.ink },

  types: { flexDirection: "row", gap: sw(8) },
  typeCell: { flex: 1 },
  type: {
    alignItems: "center",
    gap: sw(6),
    paddingVertical: sw(12),
    borderRadius: sw(16),
    borderWidth: 1.5,
    borderColor: KuickpayColors.line,
    backgroundColor: "#FFFFFF",
  },
  typeIcon: { width: sw(38), height: sw(38), borderRadius: sw(13), alignItems: "center", justifyContent: "center" },
  typeText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: KuickpayColors.muted },

  billerList: { gap: sw(8) },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    height: sw(44),
    paddingHorizontal: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#F4F6FB",
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(14), color: KuickpayColors.ink, paddingVertical: 0 },
  loader: { marginVertical: sw(16) },
  billerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    padding: sw(12),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: KuickpayColors.line,
    backgroundColor: "#FFFFFF",
  },
  billerSelected: { borderColor: NAVY, borderWidth: 1.5, backgroundColor: "#F5F9FD" },
  billerBadge: { alignItems: "center", justifyContent: "center" },
  billerInitials: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#FFFFFF" },
  billerName: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: KuickpayColors.ink },
  billerRegion: { fontFamily: Fonts.regular, fontSize: sf(12), color: KuickpayColors.muted, marginTop: sw(1) },
  changePill: { paddingHorizontal: sw(10), paddingVertical: sw(5), borderRadius: 999, backgroundColor: "#E8F0F7" },
  changeText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },

  fieldLabel: { fontFamily: Fonts.semiBold, fontSize: sf(12.5), color: KuickpayColors.muted, marginTop: sw(4) },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    minHeight: sw(54),
    paddingHorizontal: sw(14),
    borderRadius: sw(14),
    borderWidth: 1.5,
    borderColor: KuickpayColors.line,
    backgroundColor: "#FFFFFF",
  },
  inputError: { borderColor: "#FCA5A5", backgroundColor: "#FFFBFB" },
  inputOk: { borderColor: "#86EFAC" },
  input: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: sf(17),
    letterSpacing: 1,
    color: KuickpayColors.ink,
    paddingVertical: sw(12),
  },
  inputText: { fontFamily: Fonts.medium, fontSize: sf(15), letterSpacing: 0 },
  pasteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(10),
    paddingVertical: sw(6),
    borderRadius: 999,
    backgroundColor: "#E8F0F7",
  },
  pasteText: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: NAVY },
  counter: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#94A3B8" },
  hintRow: { flexDirection: "row", gap: sw(6), alignItems: "flex-start" },
  hint: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(18), color: KuickpayColors.muted },
  errorRow: { flexDirection: "row", gap: sw(8), alignItems: "flex-start" },
  errorText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(12), lineHeight: sf(18), color: DANGER },
  privacy: {
    flexDirection: "row",
    gap: sw(8),
    alignItems: "flex-start",
    padding: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#ECFDF5",
  },
  privacyText: { flex: 1, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(18), color: "#065F46" },

  footer: {
    paddingHorizontal: sw(16),
    paddingTop: sw(10),
    paddingBottom: sw(10),
    gap: sw(4),
    backgroundColor: "#F4F6FB",
    borderTopWidth: 1,
    borderTopColor: "#E9EEF5",
  },
  primaryBtn: {
    minHeight: sw(52),
    borderRadius: sw(16),
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(10),
  },
  primaryText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
  disabled: { opacity: 0.45 },
  linkBtn: { alignItems: "center", paddingVertical: sw(10) },
  linkText: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: NAVY },

  successCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: sw(20),
    padding: sw(22),
    gap: sw(8),
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 4 }, opacity: 0.05, radius: 12, elevation: 2 }),
  },
  successIcon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    backgroundColor: "#ECFDF5",
    borderWidth: sw(5),
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  successTitle: { fontFamily: Fonts.bold, fontSize: sf(18), color: KuickpayColors.ink, textAlign: "center" },
  successBody: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(19), color: KuickpayColors.muted, textAlign: "center" },
  confirmRows: { alignSelf: "stretch", marginTop: sw(10), borderTopWidth: 1, borderTopColor: KuickpayColors.line },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: sw(12),
    paddingVertical: sw(11),
    borderBottomWidth: 1,
    borderBottomColor: KuickpayColors.line,
  },
  confirmLabel: { fontFamily: Fonts.regular, fontSize: sf(13), color: KuickpayColors.muted },
  confirmValue: { flexShrink: 1, fontFamily: Fonts.semiBold, fontSize: sf(13), color: KuickpayColors.ink, textAlign: "right" },
  confirmValueStrong: { fontFamily: Fonts.bold, fontSize: sf(15), color: KuickpayColors.brandDark },
});
