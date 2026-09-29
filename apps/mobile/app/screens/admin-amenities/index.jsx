import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Switch, useWindowDimensions } from "react-native";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { useRequireCommunityAdmin } from "../../../hooks/use-require-community-admin";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  CircleDollarSign,
  MapPin,
  Users,
} from "lucide-react-native";
import ScreenHeader from "../../../components/layout/screen-header";
import AmenityIcon from "../../../components/property/amenity-icon";
import BusinessHoursInput from "../../../components/ui/business-hours-input";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { AdminTheme } from "../../../constants/admin-theme";
import { sf, sw } from "../../../utils/responsive";
import { chevronForward } from "../../../utils/rtl";
import {
  fetchAdminAmenities,
  fetchBookingInbox,
  createAmenity,
  updateAmenity,
  deleteAmenity,
  approveAmenity,
  rejectAmenity,
} from "../../../services/amenity-api";
import AmenityPaymentProofModal from "../../../components/property/amenity-payment-proof-modal";
import {
  AMENITY_ICON_CATALOG,
  SLOT_DURATION_OPTIONS,
  getAmenityVisual,
  getAmenityStatus,
  validateAmenityForm,
  isAmenityFormReady,
  buildAmenityPayload,
  generateAmenitySlots,
  parseHoursToApiTimes,
  formatAmenityFeeLabel,
  amenityMatchesSearch,
} from "../../../utils/amenity-display";
import SearchInput from "../../../components/ui/search-input";
import { useApiAction } from "../../../hooks/use-api-action";
import useOverlayChrome from "../../../hooks/use-overlay-chrome";
import { useAppDialog } from "../../../providers/app-dialog-provider";
import { rnShadow } from "../../../utils/shadow";


const STATUS_OPTIONS = [
  { key: "bookable", labelKey: "admin.timedSlots", shortKey: "admin.slotsShort", hintKey: "admin.timedSlotsHint" },
  { key: "open", labelKey: "admin.openAvailability", shortKey: "admin.openShort", hintKey: "admin.openAvailabilityHint" },
  { key: "closed", labelKey: "admin.closed", shortKey: "admin.closedShort", hintKey: "admin.closedHint" },
];

const FILTERS = [
  { key: "all", labelKey: "admin.all" },
  { key: "mine", labelKey: "admin.yours" },
  { key: "my_bookings", labelKey: "admin.myBooking" },
  { key: "booking_requests", labelKey: "admin.bookingRequests" },
  { key: "pending", labelKey: "admin.needApproval" },
  { key: "bookable", labelKey: "admin.slotsShort" },
  { key: "open", labelKey: "admin.openShort" },
  { key: "closed", labelKey: "admin.closedShort" },
];

const BOOKING_STATUS_META = {
  pending: { label: "admin.pending", color: "#B45309", bg: "#FEF3C7" },
  awaiting_payment: { label: "propertyMgmt.statusAwaitingPayment", color: "#B45309", bg: "#FEF3C7" },
  confirmed: { label: "admin.approved", color: "#047857", bg: "#ECFDF5" },
  rejected: { label: "admin.rejected", color: "#B91C1C", bg: "#FEF2F2" },
};

function canPayAmenityBooking(item) {
  return item?.user_next_booking_status === "awaiting_payment"
    && item?.user_next_booking_bill?.can_submit_proof === true;
}

function bookingStatusMeta(status) {
  return BOOKING_STATUS_META[status] ?? { label: "admin.booked", color: AdminTheme.accent, bg: AdminTheme.accentSoft };
}

const EMPTY_FORM = {
  name: "",
  description: "",
  status: "bookable",
  capacity: "",
  floor: "",
  hours: "",
  weekends_available: true,
  slot_duration_minutes: 60,
  icon_key: "",
  custom_category: "",
  booking_fee: "0",
  shared_billing_enabled: false,
  shared_billing_frequency: "monthly",
  shared_billing_amount: "",
  shared_billing_due_day: "",
};

function shortStatusLabel(status, t) {
  const opt = STATUS_OPTIONS.find((o) => o.key === status);
  if (opt) return t(opt.shortKey);
  return getAmenityStatus(status).label;
}

function MetaChip({ icon: Icon, label }) {
  if (!label) return null;
  return (
    <View style={styles.metaChip}>
      <Icon size={sf(11)} color="#64748B" strokeWidth={2} />
      <Text style={styles.metaChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatChip({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#FFFFFF", text: AdminTheme.text, sub: AdminTheme.textMuted, border: AdminTheme.border },
    bookable: { bg: AdminTheme.amber.bg, text: AdminTheme.amber.text, sub: "#D97706", border: AdminTheme.amber.border },
    open: { bg: AdminTheme.emerald.bg, text: AdminTheme.emerald.text, sub: "#059669", border: AdminTheme.emerald.border },
    closed: { bg: AdminTheme.rose.bg, text: AdminTheme.rose.text, sub: "#E11D48", border: AdminTheme.rose.border },
  };
  const palette = tones[tone] ?? tones.default;

  return (
    <View style={[styles.statChip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.sub }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function AmenityCard({ item, onOpen, onApprove, onReject, busy, t }) {
  const visual = getAmenityVisual(item.name, item.icon_key);
  const status = getAmenityStatus(item.status);
  const reviewPending = item.review_status === "pending";
  const reviewRejected = item.review_status === "rejected";
  const isMine = Boolean(item.is_mine);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => onOpen(item)}>
      <View style={[styles.cardIconWell, { backgroundColor: visual.soft }]}>
        <AmenityIcon
          iconKey={item.icon_key}
          name={item.name}
          size={sf(18)}
          color={visual.tint}
        />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {reviewPending ? (
            <View style={[styles.statusPill, { backgroundColor: "#FEF3C7" }]}>
              <View style={[styles.statusDot, { backgroundColor: "#F59E0B" }]} />
              <Text style={[styles.statusText, { color: "#B45309" }]} numberOfLines={1}>
                {t("admin.pending")}
              </Text>
            </View>
          ) : reviewRejected ? (
            <View style={[styles.statusPill, { backgroundColor: "#FEF2F2" }]}>
              <View style={[styles.statusDot, { backgroundColor: "#EF4444" }]} />
              <Text style={[styles.statusText, { color: "#B91C1C" }]} numberOfLines={1}>
                {t("admin.rejected")}
              </Text>
            </View>
          ) : (
            <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
              <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>
                {shortStatusLabel(item.status, t)}
              </Text>
            </View>
          )}
        </View>
        {item.creator_name ? (
          <Text style={styles.cardDesc} numberOfLines={1}>
            {isMine ? t("admin.yourAmenity") : t("admin.byCreator", { name: item.creator_name })}
          </Text>
        ) : item.description ? (
          <Text style={styles.cardDesc} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
        {item.user_has_upcoming_booking && item.user_next_booking_date ? (
          <View style={styles.bookingRow}>
            <Text style={styles.bookingHint} numberOfLines={1}>
              {t("admin.yourBookingLabel")} · {item.user_next_booking_date}
              {item.user_next_booking_time_slot ? ` · ${item.user_next_booking_time_slot}` : ""}
            </Text>
            {item.user_next_booking_status ? (
              <View
                style={[
                  styles.bookingStatusPill,
                  { backgroundColor: bookingStatusMeta(item.user_next_booking_status).bg },
                ]}
              >
                <Text
                  style={[
                    styles.bookingStatusText,
                    { color: bookingStatusMeta(item.user_next_booking_status).color },
                  ]}
                >
                  {t(bookingStatusMeta(item.user_next_booking_status).label)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.metaRow}>
          {item.capacity > 0 ? <MetaChip icon={Users} label={`${item.capacity}`} /> : null}
          {item.floor ? <MetaChip icon={MapPin} label={item.floor} /> : null}
          {item.hours ? <MetaChip icon={Clock} label={item.hours} /> : null}
          <MetaChip icon={CircleDollarSign} label={formatAmenityFeeLabel(item)} />
        </View>
        {reviewPending ? (
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={[styles.reviewBtn, styles.reviewReject]}
              disabled={busy}
              onPress={(e) => {
                e?.stopPropagation?.();
                onReject?.(item);
              }}
            >
              <Text style={styles.reviewRejectText}>{t("admin.reject")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewBtn, styles.reviewApprove]}
              disabled={busy}
              onPress={(e) => {
                e?.stopPropagation?.();
                onApprove?.(item);
              }}
            >
              <Text style={styles.reviewApproveText}>{t("admin.approve")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <Feather name={chevronForward()} size={sf(16)} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

function FieldLabel({ children, required, first }) {
  return (
    <Text style={first ? styles.labelFirst : styles.label}>
      {children}
      {required ? <Text style={styles.requiredStar}> *</Text> : null}
    </Text>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return <Text style={styles.fieldError}>{message}</Text>;
}

function IconSelectField({ value, error, onChange, t }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const selected = value ? getAmenityVisual("", value) : null;
  const sheetMaxHeight = Math.round(height * 0.62);
  const listMaxHeight = Math.max(180, sheetMaxHeight - 72 - Math.max(insets.bottom, 12));
  useOverlayChrome(open);

  return (
    <>
      <TouchableOpacity
        style={[styles.selectField, error && styles.inputError]}
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
      >
        {selected ? (
          <View style={[styles.selectIconWrap, { backgroundColor: selected.soft }]}>
            <AmenityIcon iconKey={selected.key} size={sf(16)} color={selected.tint} />
          </View>
        ) : (
          <View style={[styles.selectIconWrap, styles.selectIconPlaceholder]}>
            <Feather name="grid" size={sf(14)} color="#94A3B8" />
          </View>
        )}
        <Text
          style={[styles.selectLabel, !selected && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {selected ? selected.label : t("admin.selectCategory")}
        </Text>
        <ChevronDown size={sf(16)} color="#94A3B8" strokeWidth={2} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.iconSheet,
              {
                maxHeight: sheetMaxHeight,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {t("admin.selectCategory")}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8} style={styles.sheetClose}>
                <Feather name="x" size={sf(16)} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={styles.iconSheetContent}
              bounces={false}
            >
              {AMENITY_ICON_CATALOG.map((icon) => {
                const active = value === icon.key;
                return (
                  <TouchableOpacity
                    key={icon.key}
                    style={[styles.iconOption, active && styles.iconOptionActive]}
                    activeOpacity={0.85}
                    onPress={() => {
                      onChange(icon.key);
                      setOpen(false);
                    }}
                  >
                    <View style={[styles.iconOptionWell, { backgroundColor: icon.soft }]}>
                      <AmenityIcon iconKey={icon.key} size={sf(16)} color={icon.tint} />
                    </View>
                    <Text
                      style={[styles.iconOptionLabel, active && styles.iconOptionLabelActive]}
                      numberOfLines={1}
                    >
                      {icon.label}
                    </Text>
                    {active ? (
                      <Check size={sf(15)} color={Colors.brandPrimaryDeep} strokeWidth={2.5} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function AdminAmenitiesScreen() {
  useRequireCommunityAdmin();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 640;
  const numColumns = isWide ? 2 : 1;
  const listPad = Math.max(16, Math.min(20, Math.round(width * 0.05)));
  const listGap = 8;
  const cardWidth = isWide
    ? (width - listPad * 2 - listGap) / 2
    : width - listPad * 2;

  const [amenities, setAmenities] = useState([]);
  const [pendingReview, setPendingReview] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [trackingBooking, setTrackingBooking] = useState(null);
  const [proofFor, setProofFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { runAction, showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();
  const router = useRouter();
  const [pendingBookingRequests, setPendingBookingRequests] = useState(0);

  const formErrors = useMemo(() => validateAmenityForm(form), [form]);
  const canSubmit = isAmenityFormReady(form) && !saving;
  const formPad = Math.max(14, Math.min(20, Math.round(width * 0.045)));
  const stackFields = width < 520;
  const isCompactHeight = height < 700;
  const formTopPad = insets.top;
  const formBottomPad = Math.max(insets.bottom, 10);

  const previewSlots = useMemo(() => {
    if (form.status !== "bookable") return [];
    const times = parseHoursToApiTimes(form.hours);
    if (!times) return [];
    return generateAmenitySlots(
      times.start_time,
      times.end_time,
      form.slot_duration_minutes,
    ).slice(0, 6);
  }, [form.hours, form.slot_duration_minutes, form.status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, requests] = await Promise.all([
        fetchAdminAmenities(),
        fetchBookingInbox().catch(() => []),
      ]);
      setAmenities(result.data ?? []);
      setPendingReview(result.pendingReview ?? 0);
      setPendingBookingRequests((requests ?? []).filter((b) => b.status === "pending").length);
    } catch (err) {
      await showFailure(t("admin.couldNotLoadAmenities"), err);
    } finally {
      setLoading(false);
    }
  }, [showFailure, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stats = useMemo(() => {
    const total = amenities.length;
    const mine = amenities.filter((a) => a.is_mine).length;
    const myBookings = amenities.filter((a) => a.user_has_upcoming_booking).length;
    const bookable = amenities.filter((a) => a.status === "bookable").length;
    const open = amenities.filter((a) => a.status === "open").length;
    const closed = amenities.filter((a) => a.status === "closed").length;
    const pending = amenities.filter((a) => a.review_status === "pending").length;
    return {
      total,
      mine,
      myBookings,
      bookingRequests: pendingBookingRequests,
      bookable,
      open,
      closed,
      pending: pending || pendingReview,
    };
  }, [amenities, pendingReview, pendingBookingRequests]);

  const filtered = useMemo(() => {
    const byFilter =
      filter === "all"
        ? amenities
        : filter === "mine"
          ? amenities.filter((a) => a.is_mine)
          : filter === "my_bookings"
            ? amenities.filter((a) => a.user_has_upcoming_booking)
            : filter === "pending"
              ? amenities.filter((a) => a.review_status === "pending")
              : amenities.filter((a) => a.status === filter);
    return byFilter.filter((amenity) => amenityMatchesSearch(amenity, search));
  }, [amenities, filter, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setTouched({});
    setFormOpen(true);
  };

  const openEdit = (item) => {
    if (!item?.is_mine) return;
    setViewing(null);
    setEditing(item);
    setForm({
      name: item.name ?? "",
      description: item.description ?? "",
      status: item.status ?? "bookable",
      capacity: item.capacity != null && Number(item.capacity) > 0 ? String(item.capacity) : "",
      floor: item.floor ?? "",
      hours: item.hours ?? "",
      weekends_available: item.weekends_available !== false,
      slot_duration_minutes: item.slot_duration_minutes ?? 60,
      icon_key: item.icon_key || getAmenityVisual(item.name).key || "",
      custom_category: item.custom_category ?? "",
      booking_fee: item.booking_fee != null ? String(item.booking_fee) : "0",
      shared_billing_enabled: Boolean(item.shared_billing_enabled),
      shared_billing_frequency: item.shared_billing_frequency === "yearly" ? "yearly" : "monthly",
      shared_billing_amount: item.shared_billing_amount != null ? String(item.shared_billing_amount) : "",
      shared_billing_due_day: item.shared_billing_due_day != null ? String(item.shared_billing_due_day) : "",
    });
    setFieldErrors({});
    setTouched({});
    setFormOpen(true);
  };

  const openAmenity = (item) => {
    if (filter === "my_bookings" && item?.user_has_upcoming_booking) {
      setTrackingBooking(item);
      return;
    }
    if (item?.is_mine) {
      openEdit(item);
      return;
    }
    setViewing(item);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setFieldErrors({});
    setTouched({});
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const errorFor = (key) => {
    if (!touched[key] && !fieldErrors[key]) return null;
    return fieldErrors[key] || formErrors[key] || null;
  };

  const handleSave = async () => {
    if (editing && !editing.is_mine) return;
    const errors = validateAmenityForm(form);
    setFieldErrors(errors);
    setTouched({
      name: true,
      description: true,
      status: true,
      capacity: true,
      floor: true,
      hours: true,
      icon_key: true,
      custom_category: true,
      weekends_available: true,
      slot_duration_minutes: true,
      booking_fee: true,
      shared_billing_amount: true,
      shared_billing_due_day: true,
    });
    if (Object.keys(errors).length > 0) return;

    const name = form.name.trim();
    const payload = buildAmenityPayload(form);

    setSaving(true);
    try {
      await runAction({
        action: () =>
          editing ? updateAmenity(editing.id, payload) : createAmenity(payload),
        successTitle: editing ? t("admin.amenityUpdated") : t("admin.amenityCreated"),
        successMessage: editing
          ? t("admin.amenitySaved", { name })
          : t("admin.amenityNowAvailable", { name }),
        errorTitle: editing ? t("admin.updateFailed") : t("admin.couldNotCreateAmenity"),
        onSuccess: () => {
          closeForm();
          load();
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAmenity = async (item) => {
    setBusyId(item.id);
    try {
      await runAction({
        action: () => approveAmenity(item.id),
        successTitle: t("admin.amenityApproved"),
        successMessage: t("admin.amenityNowLive", { name: item.name }),
        errorTitle: t("admin.couldNotApprove"),
        onSuccess: () => load(),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectAmenity = async (item) => {
    const confirmed = await showConfirm(
      t("admin.rejectAmenity"),
      t("admin.rejectAmenityMessage", { name: item.name }),
      { confirmLabel: t("admin.reject"), cancelLabel: t("admin.keep"), destructive: true },
    );
    if (confirmed !== "confirm") return;

    setBusyId(item.id);
    try {
      await runAction({
        action: () => rejectAmenity(item.id),
        successTitle: t("admin.amenityRejected"),
        successMessage: t("admin.creatorNotified"),
        errorTitle: t("admin.couldNotReject"),
        onSuccess: () => load(),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!editing?.is_mine) return;
    if (!editing) return;
    const confirmed = await showConfirm(
      t("admin.deleteAmenity"),
      t("admin.deleteAmenityMessage", { name: editing.name }),
      { confirmLabel: t("admin.delete"), cancelLabel: t("admin.keep"), destructive: true },
    );
    if (confirmed !== "confirm") return;

    setSaving(true);
    try {
      await runAction({
        action: () => deleteAmenity(editing.id),
        successTitle: t("admin.amenityDeleted"),
        successMessage: t("admin.amenityRemoved", { name: editing.name }),
        errorTitle: t("admin.couldNotDelete"),
        onSuccess: () => {
          closeForm();
          load();
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const subtitle = useMemo(() => {
    if (loading) return t("admin.loading");
    const n = amenities.length;
    return t("admin.amenitiesSubtitle", { count: n });
  }, [amenities.length, loading, t]);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScreenHeader
        layout="inline"
        title={t("admin.amenities")}
        subtitle={subtitle}
        iconOnly
        right={
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
            <Feather name="plus" size={sf(20)} color={Colors.brandPrimaryDeep} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <ActivityIndicator color={Colors.brandPrimaryDeep} style={{ marginTop: sw(48) }} />
      ) : (
        <FlatList
          key={`list-${numColumns}`}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          numColumns={numColumns}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.list,
            {
              paddingHorizontal: listPad,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          columnWrapperStyle={numColumns > 1 ? { gap: listGap } : undefined}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={[styles.statsRow, isWide && styles.statsRowWide]}>
                <StatChip label={t("admin.total")} value={stats.total} />
                <StatChip label={t("admin.pending")} value={stats.pending} tone="bookable" />
                <StatChip label={t("admin.slotsShort")} value={stats.bookable} tone="bookable" />
                <StatChip label={t("admin.openShort")} value={stats.open} tone="open" />
              </View>

              <SearchInput
                placeholder={t("propertyMgmt.searchAmenities")}
                value={search}
                onChangeText={setSearch}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
                keyboardShouldPersistTaps="handled"
              >
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  const count =
                    f.key === "all"
                      ? stats.total
                      : f.key === "mine"
                        ? stats.mine
                        : f.key === "my_bookings"
                          ? stats.myBookings
                        : f.key === "booking_requests"
                          ? stats.bookingRequests
                        : f.key === "pending"
                          ? stats.pending
                          : f.key === "bookable"
                            ? stats.bookable
                            : f.key === "open"
                              ? stats.open
                              : stats.closed;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => {
                        if (f.key === "booking_requests") {
                          router.push("/screens/admin-bookings");
                          return;
                        }
                        setFilter(f.key);
                      }}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {t(f.labelKey)}
                      </Text>
                      <View style={[styles.filterCount, active && styles.filterCountActive]}>
                        <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                          {count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ width: cardWidth, marginBottom: listGap }}>
              <AmenityCard
                item={item}
                onOpen={openAmenity}
                onApprove={handleApproveAmenity}
                onReject={handleRejectAmenity}
                busy={busyId === item.id}
                t={t}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Building2 size={sf(28)} color={AdminTheme.accent} strokeWidth={1.75} />
              </View>
              <Text style={styles.emptyTitle}>
                {search.trim()
                  ? t("propertyMgmt.noAmenitiesMatch")
                  : filter === "all"
                    ? t("admin.noAmenitiesYet")
                    : filter === "pending"
                      ? t("admin.noAmenitiesWaiting")
                      : filter === "my_bookings"
                        ? t("admin.noUpcomingBookings")
                        : t("admin.noFilterFacilities", { filter })}
              </Text>
              <Text style={styles.emptyText}>
                {search.trim()
                  ? t("admin.tryAnotherFilter")
                  : filter === "all"
                    ? t("admin.addAmenitiesHint")
                    : filter === "my_bookings"
                      ? t("admin.bookFacilityHint")
                      : t("admin.tryAnotherFilter")}
              </Text>
              {filter === "all" && !search.trim() ? (
                <TouchableOpacity style={styles.emptyBtn} onPress={openCreate} activeOpacity={0.9}>
                  <Feather name="plus" size={sf(16)} color="#FFFFFF" />
                  <Text style={styles.emptyBtnText}>{t("admin.addFirstFacility")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}

      <Modal
        visible={formOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closeForm}
      >
        <View style={[styles.formScreen, { paddingTop: formTopPad }]}>
          {formOpen ? <StatusBar style="dark" /> : null}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.formScreenBody}
            enabled={Platform.OS === "ios"}
          >
            <View style={[styles.formHeader, { paddingHorizontal: formPad }]}>
              <TouchableOpacity
                onPress={closeForm}
                disabled={saving}
                style={styles.formBackBtn}
                hitSlop={8}
              >
                <Feather name="arrow-left" size={sf(17)} color={AdminTheme.text} />
              </TouchableOpacity>
              <View style={styles.formHeaderCopy}>
                <Text style={styles.formTitle} numberOfLines={1}>
                  {editing ? t("admin.editAmenity") : t("admin.newAmenity")}
                </Text>
                <Text style={styles.formHint} numberOfLines={1}>
                  {t("admin.fieldsRequired")}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.formScrollView}
              contentContainerStyle={[
                styles.formScroll,
                {
                  paddingHorizontal: formPad,
                  paddingBottom: 24,
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              bounces={false}
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            >
              <View style={styles.formCard}>
                <FieldLabel required first>
                  {t("admin.name")}
                </FieldLabel>
                <LocaleTextInput
                  style={[styles.input, errorFor("name") && styles.inputError]}
                  value={form.name}
                  onChangeText={(v) => setField("name", v)}
                  onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                  placeholder={t("admin.namePlaceholder")}
                  placeholderTextColor="#94A3B8"
                  maxLength={100}
                />
                <FieldError message={errorFor("name")} />

                <FieldLabel>{t("admin.description")}</FieldLabel>
                <LocaleTextInput
                  style={[
                    styles.input,
                    styles.textarea,
                    isCompactHeight && styles.textareaCompact,
                    errorFor("description") && styles.inputError,
                  ]}
                  value={form.description}
                  onChangeText={(v) => setField("description", v)}
                  onBlur={() => setTouched((prev) => ({ ...prev, description: true }))}
                  placeholder={t("admin.descriptionPlaceholder")}
                  placeholderTextColor="#94A3B8"
                  multiline
                  maxLength={2000}
                />
                <FieldError message={errorFor("description")} />

                <FieldLabel required>{t("admin.availability")}</FieldLabel>
                <View style={styles.statusChips}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = form.status === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.statusChip, active && styles.statusChipActive]}
                        onPress={() => setField("status", opt.key)}
                        activeOpacity={0.88}
                      >
                        <Text
                          style={[styles.statusChipText, active && styles.statusChipTextActive]}
                          numberOfLines={1}
                        >
                          {t(opt.shortKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <FieldError message={errorFor("status")} />

                {form.status !== "open" ? (
                  <>
                    <FieldLabel>{t("admin.capacity")}</FieldLabel>
                    <LocaleTextInput
                      style={[
                        styles.input,
                        errorFor("capacity") && styles.inputError,
                        form.status === "closed" && styles.inputDisabled,
                      ]}
                      value={form.capacity}
                      onChangeText={(v) => setField("capacity", v.replace(/[^0-9]/g, ""))}
                      onBlur={() => setTouched((prev) => ({ ...prev, capacity: true }))}
                      keyboardType="number-pad"
                      placeholder={t("admin.capacityPlaceholder")}
                      placeholderTextColor="#94A3B8"
                      maxLength={4}
                      editable={form.status !== "closed"}
                    />
                    <Text style={styles.fieldHint}>{t("admin.capacitySlotsHint")}</Text>
                    <FieldError message={errorFor("capacity")} />
                  </>
                ) : null}

                <FieldLabel required>{t("admin.location")}</FieldLabel>
                <LocaleTextInput
                  style={[styles.input, errorFor("floor") && styles.inputError]}
                  value={form.floor}
                  onChangeText={(v) => setField("floor", v)}
                  onBlur={() => setTouched((prev) => ({ ...prev, floor: true }))}
                  placeholder={t("admin.locationPlaceholder")}
                  placeholderTextColor="#94A3B8"
                  maxLength={40}
                />
                <FieldError message={errorFor("floor")} />

                <FieldLabel required>{t("admin.dailyHours")}</FieldLabel>
                <BusinessHoursInput
                  key={editing?.id ?? "create"}
                  value={form.hours}
                  showError={Boolean(errorFor("hours"))}
                  onChange={(value) => {
                    setField("hours", value);
                    setTouched((prev) => ({ ...prev, hours: true }));
                  }}
                />
                <FieldError message={errorFor("hours")} />

                <View style={styles.switchRow}>
                  <View style={styles.switchCopy}>
                    <Text style={styles.switchTitle}>{t("admin.availableOnWeekends")}</Text>
                    <Text style={styles.switchHint}>{t("admin.turnOffWeekends")}</Text>
                  </View>
                  <Switch
                    value={Boolean(form.weekends_available)}
                    onValueChange={(v) => setField("weekends_available", v)}
                    trackColor={{ false: "#E2E8F0", true: "#93C5FD" }}
                    thumbColor={form.weekends_available ? "#1B4F8A" : "#F8FAFC"}
                  />
                </View>
                <FieldError message={errorFor("weekends_available")} />

                {form.status === "bookable" ? (
                  <>
                    <FieldLabel required>{t("admin.slotDuration")}</FieldLabel>
                    <View style={styles.durationRow}>
                      {SLOT_DURATION_OPTIONS.map((opt) => {
                        const active = Number(form.slot_duration_minutes) === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.durationChip, active && styles.durationChipActive]}
                            onPress={() => setField("slot_duration_minutes", opt.value)}
                            activeOpacity={0.88}
                          >
                            <Text
                              style={[
                                styles.durationChipText,
                                active && styles.durationChipTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <FieldError message={errorFor("slot_duration_minutes")} />
                    {previewSlots.length > 0 ? (
                      <View style={styles.previewCard}>
                        <Text style={styles.previewTitle}>{t("admin.generatedSlotsPreview")}</Text>
                        {previewSlots.map((slot) => (
                          <Text key={slot.value} style={styles.previewSlot}>
                            {slot.value}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {(form.status === "bookable" || form.status === "open") && !form.shared_billing_enabled ? (
                  <>
                    <FieldLabel>{t("admin.bookingFee")}</FieldLabel>
                    <LocaleTextInput
                      style={[styles.input, errorFor("booking_fee") && styles.inputError]}
                      value={String(form.booking_fee ?? "")}
                      onChangeText={(v) => setField("booking_fee", v.replace(/[^0-9.]/g, ""))}
                      onBlur={() => setTouched((prev) => ({ ...prev, booking_fee: true }))}
                      placeholder="0"
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.switchHint}>{t("admin.bookingFeeHint")}</Text>
                    <FieldError message={errorFor("booking_fee")} />
                  </>
                ) : null}

                <View style={styles.switchRow}>
                  <View style={styles.switchCopy}>
                    <Text style={styles.switchTitle}>{t("admin.sharedBilling")}</Text>
                    <Text style={styles.switchHint}>{t("admin.sharedBillingHint")}</Text>
                  </View>
                  <Switch
                    value={Boolean(form.shared_billing_enabled)}
                    onValueChange={(v) => {
                      setField("shared_billing_enabled", v);
                      if (v) {
                        setField("booking_fee", "0");
                      } else {
                        setField("shared_billing_amount", "");
                        setField("shared_billing_due_day", "");
                      }
                    }}
                    trackColor={{ false: "#E2E8F0", true: "#93C5FD" }}
                    thumbColor={form.shared_billing_enabled ? "#1B4F8A" : "#F8FAFC"}
                  />
                </View>

                {form.shared_billing_enabled ? (
                  <>
                    <FieldLabel required>{t("admin.sharedBillingFrequency")}</FieldLabel>
                    <View style={styles.durationRow}>
                      {[
                        { id: "monthly", label: t("admin.sharedBillingMonthly") },
                        { id: "yearly", label: t("admin.sharedBillingYearly") },
                      ].map((opt) => {
                        const selected = (form.shared_billing_frequency || "monthly") === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            onPress={() => setField("shared_billing_frequency", opt.id)}
                            style={[styles.durationChip, selected && styles.durationChipActive]}
                          >
                            <Text style={[styles.durationText, selected && styles.durationTextActive]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  <View style={[styles.twoCol, stackFields && styles.twoColStack]}>
                    <View style={[styles.col, stackFields && styles.colStacked]}>
                      <FieldLabel required>{t("admin.amountPerResident")}</FieldLabel>
                      <LocaleTextInput
                        style={[styles.input, errorFor("shared_billing_amount") && styles.inputError]}
                        value={String(form.shared_billing_amount ?? "")}
                        onChangeText={(v) => setField("shared_billing_amount", v.replace(/[^0-9.]/g, ""))}
                        onBlur={() => setTouched((prev) => ({ ...prev, shared_billing_amount: true }))}
                        placeholder="25"
                        keyboardType="decimal-pad"
                      />
                      <FieldError message={errorFor("shared_billing_amount")} />
                    </View>
                    <View style={[styles.col, stackFields && styles.colStacked]}>
                      <FieldLabel required>{t("admin.sharedDueDay")}</FieldLabel>
                      <LocaleTextInput
                        style={[styles.input, errorFor("shared_billing_due_day") && styles.inputError]}
                        value={String(form.shared_billing_due_day ?? "")}
                        onChangeText={(v) => setField("shared_billing_due_day", v.replace(/[^0-9]/g, ""))}
                        onBlur={() => setTouched((prev) => ({ ...prev, shared_billing_due_day: true }))}
                        placeholder="10"
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <FieldError message={errorFor("shared_billing_due_day")} />
                    </View>
                  </View>
                  </>
                ) : null}

                <FieldLabel required>{t("admin.category")}</FieldLabel>
                <IconSelectField
                  value={form.icon_key}
                  error={errorFor("icon_key")}
                  onChange={(key) => {
                    setField("icon_key", key);
                    if (key !== "other") setField("custom_category", "");
                  }}
                  t={t}
                />
                <FieldError message={errorFor("icon_key")} />
                {form.icon_key === "other" ? (
                  <View style={{ marginTop: sw(10) }}>
                    <FieldLabel required>{t("propertyMgmt.customCategoryLabel")}</FieldLabel>
                    <LocaleTextInput
                      style={[styles.input, errorFor("custom_category") && styles.inputError]}
                      value={String(form.custom_category ?? "")}
                      onChangeText={(v) => setField("custom_category", v)}
                      onBlur={() => setTouched((prev) => ({ ...prev, custom_category: true }))}
                      placeholder={t("propertyMgmt.customCategoryPlaceholder")}
                      placeholderTextColor="#94A3B8"
                      maxLength={80}
                    />
                    <FieldError message={errorFor("custom_category")} />
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View
              style={[
                styles.formFooter,
                {
                  paddingHorizontal: formPad,
                  paddingBottom: formBottomPad,
                },
              ]}
            >
              {editing?.is_mine ? (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDelete}
                  disabled={saving}
                >
                  <Feather name="trash-2" size={sf(15)} color="#DC2626" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.saveBtn, (!canSubmit || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!canSubmit}
                activeOpacity={0.9}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText} numberOfLines={1}>
                    {editing ? t("admin.saveChanges") : t("admin.createAmenity")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(viewing)}
        animationType="slide"
        transparent
        onRequestClose={() => setViewing(null)}
      >
        <Pressable style={styles.viewBackdrop} onPress={() => setViewing(null)}>
          <Pressable style={styles.viewSheet} onPress={(e) => e.stopPropagation()}>
            {viewing ? (
              <>
                <View style={styles.viewHeader}>
                  <Text style={styles.viewTitle} numberOfLines={1}>
                    {viewing.name}
                  </Text>
                  <TouchableOpacity onPress={() => setViewing(null)} hitSlop={12}>
                    <Feather name="x" size={sf(20)} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.viewMeta}>
                  {viewing.creator_name
                    ? t("admin.createdBy", { name: viewing.creator_name })
                    : t("admin.communityAmenity")}
                </Text>
                <Text style={styles.viewNote}>
                  {t("admin.onlyCreatorCanEdit")}
                </Text>
                {viewing.description ? (
                  <Text style={styles.viewDescription}>{viewing.description}</Text>
                ) : null}
                {viewing.review_status === "pending" ? (
                  <View style={styles.viewActions}>
                    <TouchableOpacity
                      style={[styles.reviewBtn, styles.reviewReject]}
                      disabled={busyId === viewing.id}
                      onPress={() => {
                        const item = viewing;
                        setViewing(null);
                        handleRejectAmenity(item);
                      }}
                    >
                      <Text style={styles.reviewRejectText}>{t("admin.reject")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reviewBtn, styles.reviewApprove]}
                      disabled={busyId === viewing.id}
                      onPress={() => {
                        const item = viewing;
                        setViewing(null);
                        handleApproveAmenity(item);
                      }}
                    >
                      <Text style={styles.reviewApproveText}>{t("admin.approve")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : viewing.user_has_upcoming_booking ? (
                  <TouchableOpacity
                    style={styles.trackBtn}
                    onPress={() => {
                      const item = viewing;
                      setViewing(null);
                      setTrackingBooking(item);
                    }}
                  >
                    <Text style={styles.trackBtnText}>{t("admin.trackBooking")}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(trackingBooking)}
        animationType="slide"
        transparent
        onRequestClose={() => setTrackingBooking(null)}
      >
        <Pressable style={styles.viewBackdrop} onPress={() => setTrackingBooking(null)}>
          <Pressable style={styles.viewSheet} onPress={(e) => e.stopPropagation()}>
            {trackingBooking ? (
              <>
                <View style={styles.viewHeader}>
                  <Text style={styles.viewTitle} numberOfLines={1}>
                    {t("admin.trackBooking")}
                  </Text>
                  <TouchableOpacity onPress={() => setTrackingBooking(null)} hitSlop={12}>
                    <Feather name="x" size={sf(20)} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.viewMeta}>{trackingBooking.name}</Text>
                <View
                  style={[
                    styles.bookingStatusBanner,
                    {
                      backgroundColor: bookingStatusMeta(trackingBooking.user_next_booking_status).bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.bookingStatusBannerText,
                      { color: bookingStatusMeta(trackingBooking.user_next_booking_status).color },
                    ]}
                  >
                    {t(bookingStatusMeta(trackingBooking.user_next_booking_status).label)}
                  </Text>
                  <Text style={styles.bookingStatusHint}>
                    {trackingBooking.user_next_booking_status === "pending"
                      ? t("admin.bookingStatusPendingHint")
                      : trackingBooking.user_next_booking_status === "awaiting_payment"
                        ? trackingBooking.user_next_booking_bill?.can_submit_proof
                          ? t("admin.bookingStatusAwaitingPaymentHint")
                          : t("admin.bookingStatusPaymentReviewHint")
                      : trackingBooking.user_next_booking_status === "rejected"
                        ? t("admin.bookingStatusRejectedHint")
                        : t("admin.bookingStatusConfirmedHint")}
                  </Text>
                </View>
                <View style={styles.trackDetails}>
                  <View style={styles.trackRow}>
                    <Feather name="calendar" size={sf(14)} color={AdminTheme.accent} />
                    <Text style={styles.trackRowText}>{trackingBooking.user_next_booking_date}</Text>
                  </View>
                  {trackingBooking.user_next_booking_time_slot ? (
                    <View style={styles.trackRow}>
                      <Feather name="clock" size={sf(14)} color={AdminTheme.accent} />
                      <Text style={styles.trackRowText}>{trackingBooking.user_next_booking_time_slot}</Text>
                    </View>
                  ) : null}
                  {trackingBooking.user_next_booking_guests ? (
                    <View style={styles.trackRow}>
                      <Feather name="users" size={sf(14)} color={AdminTheme.accent} />
                      <Text style={styles.trackRowText}>
                        {t("admin.guestCount", { count: trackingBooking.user_next_booking_guests })}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {trackingBooking.creator_name ? (
                  <Text style={styles.viewNote}>
                    {t("admin.managedBy", { name: trackingBooking.creator_name })}
                  </Text>
                ) : null}
                {canPayAmenityBooking(trackingBooking) ? (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => setProofFor(trackingBooking.user_next_booking_bill)}
                  >
                    <Text style={styles.payBtnText}>{t("admin.makePayment")}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {proofFor ? (
        <AmenityPaymentProofModal
          visible
          bill={proofFor}
          amenityId={proofFor.amenity_id}
          amenityName={proofFor.amenity_name || trackingBooking?.name}
          onClose={() => setProofFor(null)}
          onSubmitted={() => {
            setProofFor(null);
            setTrackingBooking(null);
            load(true);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AdminTheme.screenBg },
  addBtn: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(20),
    backgroundColor: AdminTheme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingTop: sw(8),
  },
  headerBlock: {
    gap: sw(12),
    marginBottom: sw(14),
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
  },
  statsRowWide: {
    flexWrap: "nowrap",
  },
  statChip: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: sw(72),
    borderRadius: sw(14),
    borderWidth: 1,
    paddingVertical: sw(10),
    paddingHorizontal: sw(8),
    alignItems: "center",
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
  },
  statLabel: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(10),
  },
  filterRow: {
    gap: sw(8),
    alignItems: "center",
    paddingEnd: sw(4),
    minHeight: sw(36),
  },
  filterChip: {
    height: sw(34),
    paddingStart: sw(12),
    paddingEnd: sw(6),
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: AdminTheme.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: sw(6),
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: Colors.brandPrimaryDeep,
    borderColor: Colors.brandPrimaryDeep,
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },
  filterCount: {
    minWidth: sw(22),
    height: sw(22),
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(6),
  },
  filterCountActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  filterCountText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    color: "#64748B",
  },
  filterCountTextActive: {
    color: "#FFFFFF",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  cardIconWell: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: sw(3),
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
  },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  cardDesc: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: AdminTheme.textMuted,
    lineHeight: sf(15),
  },
  bookingHint: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(11),
    color: AdminTheme.accent,
    lineHeight: sf(15),
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(2),
  },
  bookingStatusPill: {
    paddingHorizontal: sw(7),
    paddingVertical: sw(2),
    borderRadius: 999,
    flexShrink: 0,
  },
  bookingStatusText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
  },
  bookingStatusBanner: {
    marginTop: sw(12),
    borderRadius: sw(12),
    padding: sw(12),
    gap: sw(4),
  },
  bookingStatusBannerText: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
  },
  bookingStatusHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
    lineHeight: sf(17),
  },
  trackDetails: {
    marginTop: sw(12),
    gap: sw(10),
    backgroundColor: "#F8FAFC",
    borderRadius: sw(12),
    padding: sw(12),
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
  },
  trackRowText: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  trackBtn: {
    marginTop: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AdminTheme.accentSoft,
    borderRadius: sw(12),
    paddingVertical: sw(12),
  },
  trackBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: AdminTheme.accent,
  },
  payBtn: {
    marginTop: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AdminTheme.accent,
    borderRadius: sw(12),
    paddingVertical: sw(12),
  },
  payBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(7),
    paddingVertical: sw(3),
    borderRadius: 999,
    flexShrink: 0,
    maxWidth: "46%",
  },
  statusDot: { width: sw(5), height: sw(5), borderRadius: 999 },
  statusText: { fontFamily: Fonts.semiBold, fontSize: sf(9) },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(5),
    marginTop: sw(2),
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(3),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 999,
    paddingHorizontal: sw(6),
    paddingVertical: sw(2),
    maxWidth: "100%",
  },
  metaChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "#64748B",
    flexShrink: 1,
  },
  reviewActions: {
    flexDirection: "row",
    gap: sw(8),
    marginTop: sw(8),
  },
  reviewBtn: {
    flex: 1,
    height: sw(32),
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  reviewReject: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  reviewApprove: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  reviewRejectText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#B91C1C",
  },
  reviewApproveText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#047857",
  },
  switchRow: {
    marginTop: sw(14),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
  },
  switchTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  switchHint: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: AdminTheme.textMuted,
  },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: sw(8),
  },
  durationChip: {
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: "#FFFFFF",
  },
  durationChipActive: {
    backgroundColor: Colors.brandPrimaryDeep,
    borderColor: Colors.brandPrimaryDeep,
  },
  durationChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  durationChipTextActive: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },
  previewCard: {
    marginTop: sw(10),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.15)",
    backgroundColor: "#D1FAF5",
    padding: sw(12),
    gap: sw(4),
  },
  previewTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#1B4F8A",
    marginBottom: sw(2),
  },
  previewSlot: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#334155",
  },
  empty: {
    alignItems: "center",
    paddingVertical: sw(40),
    paddingHorizontal: sw(20),
    gap: sw(10),
  },
  emptyIcon: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(22),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: AdminTheme.accentBorder,
    marginBottom: sw(4),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    color: AdminTheme.text,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: AdminTheme.textMuted,
    textAlign: "center",
    lineHeight: sf(19),
  },
  emptyBtn: {
    marginTop: sw(8),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    backgroundColor: Colors.brandPrimaryDeep,
    paddingHorizontal: sw(18),
    paddingVertical: sw(12),
    borderRadius: sw(12),
  },
  emptyBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  formScreen: {
    flex: 1,
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  formScreenBody: {
    flex: 1,
    width: "100%",
    minHeight: 0,
    backgroundColor: AdminTheme.screenBg,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AdminTheme.border,
    backgroundColor: "#FFFFFF",
    width: "100%",
  },
  formBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  formHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  formTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: AdminTheme.text,
  },
  formHint: {
    marginTop: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: AdminTheme.textMuted,
  },
  formScrollView: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },
  formScroll: {
    flexGrow: 1,
    paddingTop: 12,
    width: "100%",
  },
  formCard: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AdminTheme.borderSubtle,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: "hidden",
  },
  labelFirst: {
    marginBottom: 5,
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#64748B",
  },
  label: {
    marginTop: 12,
    marginBottom: 5,
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#64748B",
  },
  requiredStar: {
    color: "#DC2626",
    fontFamily: Fonts.bold,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    minHeight: 42,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  inputError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#94A3B8",
  },
  fieldHint: {
    marginTop: 3,
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    color: AdminTheme.textMuted,
  },
  fieldError: {
    marginTop: 3,
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "#DC2626",
    flexShrink: 1,
  },
  textarea: {
    minHeight: 72,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  textareaCompact: {
    minHeight: 56,
  },
  statusChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    width: "100%",
  },
  statusChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: "#F8FAFC",
    minHeight: 34,
    justifyContent: "center",
    flexShrink: 1,
  },
  statusChipActive: {
    borderColor: Colors.brandPrimaryDeep,
    backgroundColor: AdminTheme.accentSoft,
  },
  statusChipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  statusChipTextActive: {
    color: Colors.brandPrimaryDeep,
    fontFamily: Fonts.bold,
  },
  twoCol: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  twoColStack: {
    flexDirection: "column",
    gap: 0,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  colStacked: {
    width: "100%",
    flex: 0,
  },
  selectField: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: AdminTheme.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 42,
  },
  selectIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  selectIconPlaceholder: {
    backgroundColor: "#EEF2F7",
  },
  selectLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: AdminTheme.text,
  },
  selectPlaceholder: {
    color: "#94A3B8",
    fontFamily: Fonts.regular,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  iconSheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        ...rnShadow({ color: "#0F172A", offset: { width: 0, height: -4 }, opacity: 0.1, radius: 16 }),
      },
      android: { elevation: 12 },
    }),
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginTop: 8,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  sheetTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: AdminTheme.text,
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconSheetContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    marginBottom: 2,
    width: "100%",
  },
  iconOptionActive: {
    backgroundColor: AdminTheme.accentSoft,
  },
  iconOptionWell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconOptionLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#334155",
  },
  iconOptionLabelActive: {
    color: Colors.brandPrimaryDeep,
    fontFamily: Fonts.bold,
  },
  formFooter: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AdminTheme.borderSubtle,
    backgroundColor: "#FFFFFF",
    paddingTop: 10,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  saveBtn: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.brandPrimaryDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  saveBtnDisabled: {
    backgroundColor: "#93C5FD",
    opacity: 0.7,
  },
  saveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  viewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  viewSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: sw(20),
    borderTopRightRadius: sw(20),
    paddingHorizontal: sw(20),
    paddingTop: sw(18),
    paddingBottom: sw(28),
  },
  viewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(12),
  },
  viewTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#0F172A",
    fontWeight: "700",
  },
  viewMeta: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
    marginTop: sw(6),
  },
  viewNote: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#475569",
    marginTop: sw(12),
    padding: sw(12),
    borderRadius: sw(12),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  viewDescription: {
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: "#334155",
    marginTop: sw(12),
  },
  viewActions: {
    flexDirection: "row",
    gap: sw(10),
    marginTop: sw(16),
  },
});
