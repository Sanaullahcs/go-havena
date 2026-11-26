import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Fonts } from "../../../constants/font";
import { propertyStyles } from "../../../constants/property-styles";
import { useApiAction } from "../../../hooks/use-api-action";
import { claimLandlordOwnership, decideLandlordAdvisory, fetchLandlordPortfolio, occupancyLabelKey } from "../../../services/landlord-api";
import { fetchCommunityUnits } from "../../../services/property-services-api";
import { getCommunityId } from "../../../services/auth-session";
import { uploadUtilityBill } from "../../../services/profile-api";
import { pickImage } from "../../../utils/pickImage";
import { sf, sw } from "../../../utils/responsive";

const OCCUPANCIES = ["live_here", "rented", "vacant"];

function billPresentation(bill, t) {
  const label = String(bill?.label || "");
  if (label === "paid") return { text: t("landlord.billPaid"), bg: "#ECFDF5", color: "#047857" };
  if (label === "overdue") return { text: t("landlord.billOverdue"), bg: "#FEF2F2", color: "#B91C1C" };
  if (label === "unpaid") return { text: t("landlord.billUnpaid"), bg: "#FFFBEB", color: "#B45309" };
  return { text: t("landlord.billNone"), bg: "#F8FAFC", color: "#64748B" };
}

function visibleResidents(unit) {
  return (unit?.residents || []).filter((person) => person.status === "active" || person.status === "pending");
}

export default function LandlordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { dialog, runAction } = useApiAction();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolio, setPortfolio] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [isNewUnit, setIsNewUnit] = useState(false);
  const [occupancy, setOccupancy] = useState("rented");
  const [proofFile, setProofFile] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchLandlordPortfolio();
        setPortfolio(res.data);
      } catch (err) {
        await dialog.showError(t("landlord.title"), err?.message || String(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dialog, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!claimOpen) {
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
  }, [claimOpen]);

  const filteredCatalog = useMemo(() => {
    const query = unitQuery.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter((row) => String(row.unit_number ?? "").toLowerCase().includes(query));
  }, [catalog, unitQuery]);

  async function openClaim() {
    setUnitNumber("");
    setUnitQuery("");
    setIsNewUnit(false);
    setOccupancy("rented");
    setProofFile(null);
    setClaimOpen(true);
    setCatalogLoading(true);
    try {
      const communityId = await getCommunityId();
      const rows = communityId ? await fetchCommunityUnits(communityId) : [];
      setCatalog((rows || []).filter((row) => row.kind !== "office"));
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function submitClaim() {
    const trimmed = unitNumber.trim();
    if (!trimmed) {
      await dialog.showError(t("landlord.title"), t("landlord.unitRequired"));
      return;
    }

    await runAction({
      action: async () => {
        if (!proofFile?.uri) {
          throw new Error(t("landlord.proofRequired"));
        }
        const uploaded = await uploadUtilityBill(proofFile.uri, proofFile);
        const proofUrl = uploaded?.data?.utility_bill_url;
        if (!proofUrl) throw new Error(t("landlord.proofRequired"));
        const exists = catalog.some(
          (row) => String(row.unit_number ?? "").trim().toLowerCase() === trimmed.toLowerCase(),
        );
        return claimLandlordOwnership({
          unit_number: trimmed,
          is_new_unit: !exists,
          occupancy,
          proof_url: proofUrl,
        });
      },
      successTitle: t("landlord.claimSent"),
      onSuccess: async () => {
        setClaimOpen(false);
        setUnitNumber("");
        await load({ silent: true });
      },
    });
  }

  const units = portfolio?.landlord_units ?? [];
  const pending = portfolio?.pending_claims ?? [];
  const access = portfolio?.access;

  return (
    <SafeAreaView style={propertyStyles.safe} edges={["left", "right"]}>
      <InternalScreenHeader title={t("landlord.title")} onBack={() => router.back()} />
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
        <LinearGradient colors={["#0F3D6E", "#1B4F8A", "#0F766E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t("landlord.eyebrow")}</Text>
          <Text style={styles.heroTitle}>
            {access?.landlord_dashboard ? t("landlord.portfolioTitle") : t("landlord.headline")}
          </Text>
          <Text style={styles.heroBody}>{t("landlord.subtitle")}</Text>
          <View style={styles.statRow}>
            <View style={styles.statChip}>
              <Feather name="check-circle" size={14} color="#D1FAE5" />
              <Text style={styles.statLabel}>
                {t("landlord.approvedCount", { count: access?.landlord_unit_count ?? units.length })}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <Pressable style={styles.cta} onPress={() => void openClaim()}>
          <Feather name="plus" size={16} color="#1B4F8A" />
          <Text style={styles.ctaText}>
            {access?.landlord_dashboard ? t("landlord.addProperty") : t("landlord.becomeCta")}
          </Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator style={{ marginTop: sw(24) }} color="#0F766E" />
        ) : (
          <>
            {pending.length > 0 ? (
              <View style={styles.banner}>
                <Feather name="clock" size={16} color="#B45309" />
                <Text style={styles.bannerText}>{t("landlord.pendingBanner", { count: pending.length })}</Text>
              </View>
            ) : null}

            {(portfolio?.advisory_reviews || []).map((review) => (
              <View key={review.id} style={styles.card}>
                <Text style={styles.unitNumber}>
                  {review.unit_number}: {review.display_name || review.email}
                </Text>
                <Text style={styles.unitMeta}>{t("landlord.advisoryHint")}</Text>
                <View style={styles.modalActions}>
                  <Pressable onPress={() => void decideLandlordAdvisory(review.id, "approved").then(() => load({ silent: true }))}>
                    <Text style={styles.submitText}>{t("landlord.advisoryApprove")}</Text>
                  </Pressable>
                  <Pressable onPress={() => void decideLandlordAdvisory(review.id, "rejected", "Not recognized").then(() => load({ silent: true }))}>
                    <Text style={styles.cancelText}>{t("landlord.advisoryReject")}</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {units.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="layers" size={28} color="#94A3B8" />
                <Text style={styles.emptyTitle}>{t("landlord.emptyTitle")}</Text>
                <Text style={styles.emptyBody}>{t("landlord.emptyBody")}</Text>
              </View>
            ) : (
              <View style={{ gap: sw(12), marginTop: sw(4) }}>
                {units.map((unit) => {
                  const people = visibleResidents(unit);
                  const bill = billPresentation(unit.bill_status, t);
                  return (
                    <View key={unit.unit_id} style={styles.card}>
                      <View style={styles.cardAccent} />
                      <View style={styles.cardBody}>
                        <View style={styles.cardTop}>
                          <View style={styles.iconWrap}>
                            <Feather name="home" size={18} color="#1B4F8A" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.unitNumber}>{t("nav.unit", { number: unit.unit_number })}</Text>
                            <Text style={styles.unitMeta}>{t(occupancyLabelKey(unit.occupancy))}</Text>
                          </View>
                          <View style={[styles.billPill, { backgroundColor: bill.bg }]}>
                            <Text style={[styles.billPillText, { color: bill.color }]}>{bill.text}</Text>
                          </View>
                        </View>

                        <View style={styles.metaRow}>
                          {unit.occupancy === "rented" ? (
                            <View style={styles.metaChip}>
                              <Feather name="users" size={13} color="#1B4F8A" />
                              <Text style={styles.metaChipText}>
                                {t("landlord.residentCount", { count: unit.resident_count ?? people.length })}
                              </Text>
                            </View>
                          ) : null}
                          {unit.bill_status?.detail === "view_only" ? (
                            <View style={[styles.metaChip, styles.metaChipMuted]}>
                              <Feather name="eye" size={13} color="#64748B" />
                              <Text style={[styles.metaChipText, { color: "#64748B" }]}>{t("landlord.viewOnlyBadge")}</Text>
                            </View>
                          ) : null}
                          {unit.landlord_can_pay_bills ? (
                            <View style={[styles.metaChip, { backgroundColor: "#ECFDF5" }]}>
                              <Feather name="credit-card" size={13} color="#047857" />
                              <Text style={[styles.metaChipText, { color: "#047857" }]}>{t("landlord.canPay").replace(/^·\s*/, "")}</Text>
                            </View>
                          ) : null}
                        </View>

                        {unit.billing_contact?.name ? (
                          <Text style={styles.unitMeta}>
                            {t("landlord.billingContact", { name: unit.billing_contact.name })}
                          </Text>
                        ) : null}

                        {unit.occupancy === "rented" ? (
                          people.length === 0 ? (
                            <Text style={styles.emptyResidents}>{t("landlord.noResidentsYet")}</Text>
                          ) : (
                            <View style={styles.roster}>
                              {people.slice(0, 6).map((person) => (
                                <View key={person.id} style={styles.rosterRow}>
                                  <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>
                                      {String(person.name || person.email || "?").slice(0, 1).toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.rosterName}>{person.name || person.email}</Text>
                                    <Text style={styles.unitMeta}>
                                      {person.status}
                                      {person.is_billing_contact ? " · billing" : ""}
                                    </Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={claimOpen} animationType="slide" transparent onRequestClose={() => setClaimOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setClaimOpen(false)} />
          <View
            style={[
              styles.modalCard,
              {
                marginBottom: keyboardHeight,
                maxHeight: Math.max(280, windowHeight - keyboardHeight - insets.top - sw(12)),
                paddingBottom: keyboardHeight > 0 ? sw(12) : Math.max(insets.bottom, sw(16)),
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("landlord.claimTitle")}</Text>
              <Pressable onPress={() => setClaimOpen(false)} hitSlop={12}>
                <Feather name="x" size={20} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.modalScroll}
            >
              <Text style={styles.modalBody}>{t("landlord.claimBody")}</Text>
              <Text style={styles.fieldLabel}>{t("landlord.unitField")}</Text>
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modeChip, !isNewUnit && styles.modeChipOn]}
                  onPress={() => {
                    setIsNewUnit(false);
                    setUnitNumber("");
                  }}
                >
                  <Text style={[styles.modeText, !isNewUnit && styles.modeTextOn]}>{t("landlord.existingUnit")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeChip, isNewUnit && styles.modeChipOn]}
                  onPress={() => {
                    setIsNewUnit(true);
                    setUnitNumber("");
                    setUnitQuery("");
                  }}
                >
                  <Text style={[styles.modeText, isNewUnit && styles.modeTextOn]}>{t("landlord.newUnit")}</Text>
                </Pressable>
              </View>

              {isNewUnit ? (
                <LocaleTextInput
                  style={styles.input}
                  value={unitNumber}
                  onChangeText={setUnitNumber}
                  placeholder={t("landlord.newUnitPlaceholder")}
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
              ) : (
                <>
                  <View style={styles.searchRow}>
                    <Feather name="search" size={16} color="#64748B" />
                    <LocaleTextInput
                      style={styles.searchInput}
                      value={unitQuery}
                      onChangeText={setUnitQuery}
                      placeholder={t("landlord.searchUnits")}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                  </View>
                  <ScrollView
                    style={styles.catalogList}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {catalogLoading ? (
                      <ActivityIndicator color="#1B4F8A" style={{ marginVertical: sw(16) }} />
                    ) : filteredCatalog.length === 0 ? (
                      <Text style={styles.catalogEmpty}>{t("landlord.noUnits")}</Text>
                    ) : (
                      filteredCatalog.map((row) => {
                        const selected = unitNumber === row.unit_number;
                        return (
                          <Pressable
                            key={row.id ?? row.unit_number}
                            style={[styles.catalogRow, selected && styles.catalogRowOn]}
                            onPress={() => setUnitNumber(row.unit_number)}
                          >
                            <Text style={[styles.catalogText, selected && styles.catalogTextOn]}>
                              {row.unit_number}
                            </Text>
                            {selected ? <Feather name="check" size={16} color="#1B4F8A" /> : null}
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </>
              )}

              <Pressable
                style={styles.toggleRow}
                onPress={() =>
                  pickImage((file) => setProofFile(file), { documentPick: true, allowCamera: true })
                }
              >
                <Feather name="paperclip" size={18} color="#1B4F8A" />
                <Text style={styles.toggleText}>
                  {proofFile?.name || proofFile?.uri ? t("landlord.proofAttached") : t("landlord.attachProof")}
                </Text>
              </Pressable>
              <Text style={styles.fieldLabel}>{t("landlord.occupancyLabel")}</Text>
              <View style={styles.occRow}>
                {OCCUPANCIES.map((key) => (
                  <Pressable
                    key={key}
                    style={[styles.occChip, occupancy === key && styles.occChipActive]}
                    onPress={() => setOccupancy(key)}
                  >
                    <Text style={[styles.occChipText, occupancy === key && styles.occChipTextActive]}>
                      {t(occupancyLabelKey(key))}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setClaimOpen(false)}>
                  <Text style={styles.cancelText}>{t("common.cancel")}</Text>
                </Pressable>
                <Pressable style={styles.submitBtn} onPress={() => void submitClaim()}>
                  <Text style={styles.submitText}>{t("landlord.submitClaim")}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: sw(18),
    padding: sw(18),
    marginBottom: sw(14),
  },
  heroEyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  heroTitle: { fontFamily: Fonts.bold, fontSize: sf(26), color: "#FFFFFF", marginTop: sw(6) },
  heroBody: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "rgba(255,255,255,0.86)",
    marginTop: sw(8),
    lineHeight: sf(19),
  },
  statRow: { flexDirection: "row", marginTop: sw(14) },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: sw(999),
    paddingHorizontal: sw(12),
    paddingVertical: sw(6),
  },
  statLabel: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#FFFFFF" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D6E2F0",
    paddingVertical: sw(13),
    borderRadius: sw(14),
    marginBottom: sw(14),
  },
  ctaText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#1B4F8A" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    backgroundColor: "#FFFBEB",
    padding: sw(12),
    borderRadius: sw(12),
    marginBottom: sw(10),
  },
  bannerText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13), color: "#B45309" },
  empty: { alignItems: "center", paddingVertical: sw(32), gap: sw(8) },
  emptyTitle: { fontFamily: Fonts.semiBold, fontSize: sf(16), color: "#334155" },
  emptyBody: { fontFamily: Fonts.regular, fontSize: sf(14), color: "#64748B", textAlign: "center", paddingHorizontal: sw(16) },
  card: {
    backgroundColor: "#fff",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E6EEF6",
    overflow: "hidden",
    flexDirection: "row",
  },
  cardAccent: { width: sw(5), backgroundColor: "#1B4F8A" },
  cardBody: { flex: 1, padding: sw(14) },
  cardTop: { flexDirection: "row", alignItems: "center", gap: sw(10) },
  iconWrap: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  unitNumber: { fontFamily: Fonts.bold, fontSize: sf(16), color: "#0F172A" },
  unitMeta: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#64748B", marginTop: sw(2) },
  billPill: { borderRadius: sw(999), paddingHorizontal: sw(10), paddingVertical: sw(4) },
  billPillText: { fontFamily: Fonts.semiBold, fontSize: sf(11) },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: sw(8), marginTop: sw(12) },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(5),
    backgroundColor: "#E8F0F7",
    borderRadius: sw(999),
    paddingHorizontal: sw(10),
    paddingVertical: sw(5),
  },
  metaChipMuted: { backgroundColor: "#F1F5F9" },
  metaChipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#1B4F8A" },
  emptyResidents: { fontFamily: Fonts.regular, fontSize: sf(12), color: "#94A3B8", marginTop: sw(10) },
  roster: { marginTop: sw(10), gap: sw(8) },
  rosterRow: { flexDirection: "row", alignItems: "center", gap: sw(8) },
  avatar: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: sf(12), color: "#1B4F8A" },
  rosterName: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#0F172A" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: sw(18),
    borderTopRightRadius: sw(18),
    paddingHorizontal: sw(20),
    paddingTop: sw(16),
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(4),
  },
  modalScroll: { paddingBottom: sw(12) },
  modalTitle: { fontFamily: Fonts.bold, fontSize: sf(18), color: "#0F172A" },
  modalBody: { fontFamily: Fonts.regular, fontSize: sf(14), color: "#64748B", marginTop: sw(6), marginBottom: sw(12) },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(15),
    marginBottom: sw(10),
  },
  modeRow: { flexDirection: "row", gap: sw(8), marginBottom: sw(10) },
  modeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: sw(10),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  modeChipOn: { backgroundColor: "#E8F0F7", borderColor: "#1B4F8A" },
  modeText: { fontFamily: Fonts.medium, fontSize: sf(13), color: "#64748B" },
  modeTextOn: { fontFamily: Fonts.semiBold, color: "#1B4F8A" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    marginBottom: sw(8),
  },
  searchInput: {
    flex: 1,
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(15),
    color: "#0F172A",
  },
  catalogList: { maxHeight: sw(180), marginBottom: sw(10) },
  catalogEmpty: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: "#64748B",
    paddingVertical: sw(12),
  },
  catalogRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: sw(12),
    paddingHorizontal: sw(12),
    borderRadius: sw(10),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: sw(6),
  },
  catalogRowOn: { backgroundColor: "#E8F0F7", borderColor: "#1B4F8A" },
  catalogText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#0F172A" },
  catalogTextOn: { fontFamily: Fonts.semiBold, color: "#1B4F8A" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: sw(8), marginBottom: sw(12) },
  toggleText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#334155" },
  fieldLabel: { fontFamily: Fonts.semiBold, fontSize: sf(13), color: "#334155", marginBottom: sw(8) },
  occRow: { flexDirection: "row", flexWrap: "wrap", gap: sw(8), marginBottom: sw(16) },
  occChip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: sw(20),
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  occChipActive: { backgroundColor: "#E8F0F7", borderColor: "#1B4F8A" },
  occChipText: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#475569" },
  occChipTextActive: { color: "#1B4F8A" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: sw(12), marginTop: sw(8) },
  cancelBtn: { paddingVertical: sw(10), paddingHorizontal: sw(14) },
  cancelText: { fontFamily: Fonts.medium, fontSize: sf(14), color: "#64748B" },
  submitBtn: { backgroundColor: "#1B4F8A", paddingVertical: sw(10), paddingHorizontal: sw(18), borderRadius: sw(10) },
  submitText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#fff" },
});
