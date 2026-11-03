import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Fonts } from "../../../constants/font";
import { propertyStyles } from "../../../constants/property-styles";
import { useApiAction } from "../../../hooks/use-api-action";
import {
  fetchCommunityUnits,
  fetchMyUnits,
  submitUnitRegistrationPackage,
} from "../../../services/property-services-api";
import { uploadUtilityBill } from "../../../services/profile-api";
import { getCommunityId } from "../../../services/auth-session";
import { pickImage } from "../../../utils/pickImage";
import { sf, sw } from "../../../utils/responsive";

function statusTone(status) {
  const key = String(status || "").toLowerCase();
  if (key === "active") return { bg: "#ECFDF5", text: "#047857", labelKey: "myUnits.statusActive" };
  if (key === "pending") return { bg: "#FFFBEB", text: "#B45309", labelKey: "myUnits.statusPending" };
  if (key === "rejected") return { bg: "#FEF2F2", text: "#B91C1C", labelKey: "myUnits.statusRejected" };
  return { bg: "#F1F5F9", text: "#475569", labelKey: "myUnits.statusOther" };
}

export default function MyUnitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dialog, showFailure, showSuccess, runAction } = useApiAction();
  const [units, setUnits] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [isNewUnit, setIsNewUnit] = useState(true);
  const [residenceType, setResidenceType] = useState("homeowner");
  const [utilityFile, setUtilityFile] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!requestOpen) {
      setKeyboardHeight(0);
      return undefined;
    }

    const show = KeyboardEvents.addListener("keyboardWillShow", (event) => {
      setKeyboardHeight(Math.max(0, Number(event?.height) || 0));
    });
    const hide = KeyboardEvents.addListener("keyboardWillHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      show.remove();
      hide.remove();
      setKeyboardHeight(0);
    };
  }, [requestOpen]);

  const activeCount = useMemo(
    () => units.filter((u) => (u.association_status || "active") === "active").length,
    [units],
  );

  const enrolledUnitNumbers = useMemo(() => {
    const enrolled = new Set();
    for (const unit of units) {
      const status = String(unit.association_status || "active").toLowerCase();
      if (status !== "active" && status !== "pending" && status !== "invite") continue;
      const number = String(unit.unit_number ?? "").trim().toLowerCase();
      if (number) enrolled.add(number);
    }
    return enrolled;
  }, [units]);

  const selectableCatalog = useMemo(
    () =>
      catalog.filter((row) => {
        const number = String(row.unit_number ?? "").trim().toLowerCase();
        return number && !enrolledUnitNumbers.has(number);
      }),
    [catalog, enrolledUnitNumbers],
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const payload = await fetchMyUnits();
      setUnits(payload.units || []);
      setMeta(payload.meta || {});
    } catch (err) {
      await showFailure(t("myUnits.title"), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showFailure, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function openRequest() {
    setUnitNumber("");
    setIsNewUnit(true);
    setResidenceType("homeowner");
    setUtilityFile(null);
    setRequestOpen(true);
    try {
      const communityId = await getCommunityId();
      if (communityId) {
        const rows = await fetchCommunityUnits(communityId);
        setCatalog((rows || []).filter((row) => row.kind !== "office"));
      }
    } catch {
      setCatalog([]);
    }
  }

  async function submitRequest() {
    const trimmed = unitNumber.trim();
    if (!trimmed) {
      await dialog.showError(t("myUnits.title"), t("myUnits.unitRequired"));
      return;
    }

    if (!utilityFile?.uri) {
      await dialog.showError(t("myUnits.title"), t("myUnits.proofsRequired"));
      return;
    }

    const confirmed = await dialog.showConfirm(
      t("myUnits.requestTitle"),
      t("myUnits.requestConfirm", { unit: trimmed }),
      { confirmLabel: t("myUnits.submitRequest"), cancelLabel: t("common.cancel") },
    );
    if (confirmed !== "confirm") return;

    setSubmitting(true);
    await runAction({
      action: async () => {
        const utilityUpload = await uploadUtilityBill(utilityFile.uri, utilityFile);
        const utilityUrl = utilityUpload?.data?.utility_bill_url;
        if (!utilityUrl) {
          throw new Error(t("myUnits.proofUploadFailed"));
        }

        return submitUnitRegistrationPackage({
          kind: activeCount > 0 ? "addon" : "initial",
          units: [
            {
              unit_number: trimmed,
              is_new_unit: isNewUnit,
              residence_type: residenceType,
              utility_bill_url: utilityUrl,
            },
          ],
        });
      },
      successTitle: t("myUnits.requestSent"),
      onSuccess: async () => {
        setRequestOpen(false);
        await load({ silent: true });
        await showSuccess(t("myUnits.requestSent"), t("myUnits.requestSentBody"));
      },
    });
    setSubmitting(false);
  }

  function pickProof(setter, baseName) {
    Keyboard.dismiss();
    setKeyboardHeight(0);
    pickImage(
      (file) => setter(file),
      {
        allowCamera: true,
        allowFile: false,
        documentPick: true,
        uploadBaseName: baseName,
        promptTitle: t("onboarding.uploadDocument"),
        promptMessage: t("onboarding.uploadDocumentMsg"),
        showError: (title, message) => dialog.showError(title, message),
      },
    );
  }

  const canSubmitRequest =
    Boolean(unitNumber.trim()) &&
    Boolean(residenceType) &&
    Boolean(utilityFile?.uri) &&
    !submitting;

  return (
    <SafeAreaView style={propertyStyles.safe} edges={["left", "right"]}>
      <InternalScreenHeader title={t("myUnits.title")} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: sw(16), paddingBottom: sw(40) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ silent: true });
            }}
          />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t("myUnits.eyebrow")}</Text>
          <Text style={styles.heroTitle}>
            {t("myUnits.count", { count: activeCount })}
          </Text>
          <Text style={styles.heroBody}>{t("myUnits.subtitle")}</Text>
          {meta?.pending_initial_package ? (
            <View style={styles.banner}>
              <Feather name="clock" size={16} color="#B45309" />
              <Text style={styles.bannerText}>{t("myUnits.pendingInitial")}</Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: sw(24) }} color="#0F766E" />
        ) : units.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="home" size={28} color="#94A3B8" />
            <Text style={styles.emptyTitle}>{t("myUnits.emptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("myUnits.emptyBody")}</Text>
          </View>
        ) : (
          <View style={{ gap: sw(10) }}>
            {units.map((unit) => {
              const tone = statusTone(unit.association_status);
              const isRejected = String(unit.association_status || "").toLowerCase() === "rejected";
              return (
                <View key={`${unit.id}-${unit.association_status}`} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.iconWrap}>
                      <Feather name="home" size={18} color="#0F766E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.unitNumber}>{unit.unit_number}</Text>
                      <Text style={styles.unitMeta}>
                        {unit.is_billing_contact
                          ? t("myUnits.youAreBillingContact")
                          : unit.billing_contact?.name
                            ? t("myUnits.billingContact", { name: unit.billing_contact.name })
                            : t("myUnits.residentOnly")}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.badgeText, { color: tone.text }]}>
                        {t(tone.labelKey)}
                      </Text>
                    </View>
                  </View>
                  {isRejected ? (
                    <Pressable
                      style={styles.reasonBtn}
                      onPress={() => {
                        const reason =
                          String(unit.association_rejection_reason || "").trim()
                          || t("myUnits.rejectionReasonEmpty", {
                            defaultValue: "No reason was provided for this rejection.",
                          });
                        void dialog.showDialog({
                          type: "info",
                          title: t("myUnits.rejectionReasonTitle", {
                            defaultValue: "Rejection reason",
                          }),
                          message: reason,
                        });
                      }}
                    >
                      <Feather name="info" size={14} color="#B91C1C" />
                      <Text style={styles.reasonBtnText}>
                        {t("myUnits.viewReason", { defaultValue: "Reason" })}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {!meta?.pending_initial_package ? (
          <Pressable style={styles.cta} onPress={() => void openRequest()}>
            <Feather name="plus" size={18} color="#FFF" />
            <Text style={styles.ctaText}>{t("myUnits.requestAnother")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={requestOpen} animationType="slide" transparent onRequestClose={() => setRequestOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRequestOpen(false)} />
          <View
            style={[
              styles.modalCard,
              {
                marginBottom: keyboardHeight,
                paddingBottom: keyboardHeight > 0 ? sw(12) : Math.max(insets.bottom, sw(16)),
              },
            ]}
          >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t("myUnits.requestTitle")}</Text>
                <Pressable onPress={() => setRequestOpen(false)} hitSlop={12}>
                  <Feather name="x" size={20} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
                bounces={false}
              >
                <Text style={styles.modalBody}>{t("myUnits.requestBody")}</Text>

                <View style={styles.toggleRow}>
                  <Pressable
                    style={[styles.toggle, isNewUnit && styles.toggleOn]}
                    onPress={() => setIsNewUnit(true)}
                  >
                    <Text style={[styles.toggleText, isNewUnit && styles.toggleTextOn]}>
                      {t("myUnits.newUnit")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.toggle, !isNewUnit && styles.toggleOn]}
                    onPress={() => setIsNewUnit(false)}
                  >
                    <Text style={[styles.toggleText, !isNewUnit && styles.toggleTextOn]}>
                      {t("myUnits.existingUnit")}
                    </Text>
                  </Pressable>
                </View>

                {isNewUnit ? (
                  <LocaleTextInput
                    value={unitNumber}
                    onChangeText={setUnitNumber}
                    placeholder={t("myUnits.unitPlaceholder")}
                    style={styles.input}
                    autoCapitalize="characters"
                    returnKeyType="done"
                  />
                ) : (
                  <ScrollView style={{ maxHeight: sw(140) }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {selectableCatalog.length === 0 ? (
                      <Text style={styles.catalogEmpty}>
                        {t("myUnits.noOtherUnits", {
                          defaultValue: "You are already enrolled in every existing unit.",
                        })}
                      </Text>
                    ) : (
                      selectableCatalog.map((row) => {
                        const selected = unitNumber === row.unit_number;
                        return (
                          <Pressable
                            key={row.id}
                            style={[styles.catalogRow, selected && styles.catalogRowOn]}
                            onPress={() => setUnitNumber(row.unit_number)}
                          >
                            <Text style={[styles.catalogText, selected && styles.catalogTextOn]}>
                              {row.unit_number}
                            </Text>
                            {selected ? <Feather name="check" size={16} color="#0F766E" /> : null}
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                )}

                <View style={[styles.toggleRow, { marginTop: sw(8) }]}>
                  <Pressable
                    style={[styles.toggle, residenceType === "homeowner" && styles.toggleOn]}
                    onPress={() => setResidenceType("homeowner")}
                  >
                    <Text style={[styles.toggleText, residenceType === "homeowner" && styles.toggleTextOn]}>
                      {t("myUnits.homeowner")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.toggle, residenceType === "tenant" && styles.toggleOn]}
                    onPress={() => setResidenceType("tenant")}
                  >
                    <Text style={[styles.toggleText, residenceType === "tenant" && styles.toggleTextOn]}>
                      {t("myUnits.tenant")}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.uploadRow, utilityFile?.uri ? styles.uploadRowAttached : null]}
                  onPress={() => pickProof(setUtilityFile, "utility-bill")}
                >
                  <Feather
                    name={utilityFile?.uri ? "check-circle" : "paperclip"}
                    size={16}
                    color="#0F766E"
                  />
                  <Text style={styles.uploadText} numberOfLines={1}>
                    {utilityFile?.fileName || utilityFile?.uri
                      ? t("myUnits.utilityAttached")
                      : t("myUnits.attachUtility")}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.cta, !canSubmitRequest && styles.ctaDisabled]}
                  disabled={!canSubmitRequest}
                  onPress={() => void submitRequest()}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.ctaText}>{t("myUnits.submitRequest")}</Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = {
  hero: {
    backgroundColor: "#F0FDFA",
    borderRadius: sw(18),
    padding: sw(16),
    marginBottom: sw(16),
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  heroEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#0F766E",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: sw(6),
    fontFamily: Fonts.bold,
    fontSize: sf(22),
    color: "#0F172A",
  },
  heroBody: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    lineHeight: sf(18),
  },
  banner: {
    marginTop: sw(12),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    backgroundColor: "#FFFBEB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  bannerText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#92400E",
  },
  empty: {
    alignItems: "center",
    paddingVertical: sw(40),
    gap: sw(8),
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  emptyBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    textAlign: "center",
    paddingHorizontal: sw(24),
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: sw(16),
    padding: sw(14),
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
  },
  iconWrap: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
  },
  unitNumber: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  unitMeta: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
  },
  badgeText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    textTransform: "capitalize",
  },
  reasonBtn: {
    marginTop: sw(12),
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    borderRadius: sw(999),
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: sw(12),
    paddingVertical: sw(7),
  },
  reasonBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  cta: {
    marginTop: sw(18),
    backgroundColor: "#0F766E",
    borderRadius: sw(14),
    minHeight: sw(48),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: sw(8),
  },
  ctaDisabled: {
    backgroundColor: "#94A3B8",
    opacity: 0.7,
  },
  ctaText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#FFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: sw(22),
    borderTopRightRadius: sw(22),
    paddingHorizontal: sw(18),
    paddingTop: sw(18),
    maxHeight: "92%",
    width: "100%",
  },
  modalScrollContent: {
    paddingBottom: sw(8),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: "#0F172A",
  },
  modalBody: {
    marginTop: sw(8),
    marginBottom: sw(14),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    lineHeight: sf(18),
  },
  toggleRow: {
    flexDirection: "row",
    gap: sw(8),
    marginBottom: sw(12),
  },
  toggle: {
    flex: 1,
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: sw(10),
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  toggleOn: {
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
  },
  toggleText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
  },
  toggleTextOn: {
    color: "#0F766E",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: "#0F172A",
    marginBottom: sw(8),
  },
  catalogEmpty: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    paddingVertical: sw(12),
    paddingHorizontal: sw(4),
  },
  catalogRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    borderRadius: sw(10),
    marginBottom: sw(4),
    backgroundColor: "#F8FAFC",
  },
  catalogRowOn: {
    backgroundColor: "#F0FDFA",
  },
  catalogText: {
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: "#334155",
  },
  catalogTextOn: {
    color: "#0F766E",
  },
  uploadRow: {
    marginTop: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    borderWidth: 1,
    borderColor: "#CCFBF1",
    backgroundColor: "#F0FDFA",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
  },
  uploadRowAttached: {
    borderColor: "#5EEAD4",
    backgroundColor: "#ECFDF5",
  },
  uploadText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#0F766E",
  },
};
