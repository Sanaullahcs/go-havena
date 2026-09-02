import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect, usePathname } from "expo-router";
import InternalScreenHeader from "../../../../../../components/layout/internal-screen-header";
import { Fonts } from "../../../../../../constants/font";
import { Colors, Layout } from "../../../../../../constants/tokens";
import { sw, sf } from "../../../../../../utils/responsive";
import { PropertyManagementRoutes, amenityFlowRoutes } from "../../../../../../constants/property-management-routes";
import {
  bookAmenity,
  fetchAmenitySlots,
  fetchMyBookings,
} from "../../../../../../services/amenity-api";
import {
  buildUpcomingDates,
  formatLongDate,
  isDateBookedByUser,
} from "../../../../../../utils/amenity-display";
import { useApiAction } from "../../../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../../../hooks/use-submit-lock";

const DATES = buildUpcomingDates(14);

export default function ReservationCalender() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { id, name, status, isMine } = useLocalSearchParams();
  const amenityId = Number(id);
  const isOpenMode = String(status) === "open";
  const ownedByMe = isMine === "1" || isMine === "true";

  const [selectedDate, setSelectedDate] = useState(DATES[0]?.key ?? null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState("");
  const [userAlreadyBooked, setUserAlreadyBooked] = useState(false);
  const [myBookings, setMyBookings] = useState([]);
  const { runAction } = useApiAction();
  const { submitting, run } = useSubmitLock();

  useFocusEffect(
    useCallback(() => {
      fetchMyBookings()
        .then((rows) => setMyBookings(rows ?? []))
        .catch(() => setMyBookings([]));
    }, []),
  );

  const selectedDateBooked = useMemo(
    () => isDateBookedByUser(myBookings, amenityId, selectedDate),
    [myBookings, amenityId, selectedDate],
  );

  useEffect(() => {
    if (!ownedByMe) return;
    router.replace(PropertyManagementRoutes.ADMIN_BOOKINGS);
  }, [ownedByMe, router]);

  const loadSlots = useCallback(async () => {
    if (ownedByMe || !amenityId || !selectedDate || isOpenMode) {
      setSlots([]);
      setSlotsMessage("");
      setUserAlreadyBooked(false);
      return;
    }
    if (isDateBookedByUser(myBookings, amenityId, selectedDate)) {
      setSlots([]);
      setUserAlreadyBooked(true);
      setSlotsMessage(t("propertyMgmt.reservationForDate"));
      return;
    }
    setSlotsLoading(true);
    try {
      const result = await fetchAmenitySlots(amenityId, selectedDate);
      setSlots(result.slots ?? []);
      setUserAlreadyBooked(Boolean(result.userAlreadyBooked));
      setSlotsMessage(
        result.userAlreadyBooked
          ? result.message || t("propertyMgmt.reservationForDate")
          : result.closed
            ? result.message || t("propertyMgmt.closedThisDay")
            : "",
      );
    } catch {
      setSlots([]);
      setUserAlreadyBooked(false);
      setSlotsMessage(t("propertyMgmt.couldNotLoadSlots"));
    } finally {
      setSlotsLoading(false);
    }
  }, [amenityId, selectedDate, isOpenMode, ownedByMe, myBookings, t]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const confirmBooking = () => {
    if (ownedByMe || !selectedDate || submitting) return;
    if (!isOpenMode && !selectedSlot) return;
    run(async () => {
      await runAction({
        action: async () => {
          const result = await bookAmenity({
            amenity_id: amenityId,
            date: selectedDate,
            time_slot: isOpenMode ? undefined : selectedSlot,
          });
          return result;
        },
        successTitle:
          t("propertyMgmt.requestSubmitted"),
        successMessage: (result) => {
          const confirmed = result?.data?.status === "confirmed";
          if (confirmed) {
            return isOpenMode
              ? t("propertyMgmt.reservationConfirmed", { name, date: formatLongDate(selectedDate) })
              : t("propertyMgmt.reservationConfirmed", { name, date: `${formatLongDate(selectedDate)} (${selectedSlot})` });
          }
          return isOpenMode
            ? t("propertyMgmt.accessRequestSent", { name, date: formatLongDate(selectedDate) })
            : t("propertyMgmt.requestSlotSent", { name, date: formatLongDate(selectedDate), slot: selectedSlot });
        },
        errorTitle: t("propertyMgmt.couldNotBook"),
        onSuccess: () => router.replace(amenityFlowRoutes(pathname).myBooking),
      });
    });
  };

  const canConfirm =
    !ownedByMe &&
    Boolean(selectedDate) &&
    !selectedDateBooked &&
    !userAlreadyBooked &&
    (isOpenMode || Boolean(selectedSlot)) &&
    !submitting;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={isOpenMode ? t("propertyMgmt.requestAccess") : t("propertyMgmt.reserveSlot")}
        subtitle={name}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Dates */}
        <Text style={styles.label}>{t("propertyMgmt.selectDate")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
        >
          {DATES.map((d) => {
            const active = selectedDate === d.key;
            const bookedByUser = isDateBookedByUser(myBookings, amenityId, d.key);
            return (
              <TouchableOpacity
                key={d.key}
                activeOpacity={0.85}
                disabled={bookedByUser}
                onPress={() => {
                  setSelectedDate(d.key);
                  setSelectedSlot(null);
                }}
                style={[
                  styles.dateChip,
                  active && styles.dateChipActive,
                  bookedByUser && styles.dateChipBooked,
                ]}
              >
                <Text
                  style={[
                    styles.dateWeekday,
                    active && styles.dateActiveText,
                    bookedByUser && styles.dateBookedText,
                  ]}
                >
                  {d.weekday}
                </Text>
                <Text
                  style={[
                    styles.dateDay,
                    active && styles.dateActiveText,
                    bookedByUser && styles.dateBookedText,
                  ]}
                >
                  {d.day}
                </Text>
                <Text
                  style={[
                    styles.dateMonth,
                    active && styles.dateActiveText,
                    bookedByUser && styles.dateBookedText,
                  ]}
                >
                  {bookedByUser ? t("propertyMgmt.booked") : d.isToday ? t("propertyMgmt.todayLabel") : d.month}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isOpenMode ? (
          selectedDateBooked ? (
            <View style={styles.bookedCard}>
              <Feather name="bookmark" size={sf(18)} color="#64748B" />
              <Text style={styles.bookedTitle}>{t("propertyMgmt.alreadyBookedSection")}</Text>
              <Text style={styles.bookedCopy}>
                {t("propertyMgmt.alreadyReservation", { date: formatLongDate(selectedDate) })}
              </Text>
            </View>
          ) : (
            <View style={styles.openCard}>
              <Feather name="unlock" size={sf(18)} color="#047857" />
              <Text style={styles.openTitle}>{t("propertyMgmt.openAvailability")}</Text>
              <Text style={styles.openCopy}>
                {t("propertyMgmt.noSlotNeeded")}
              </Text>
            </View>
          )
        ) : (
          <>
            <View style={styles.slotHead}>
              <Text style={styles.label}>{t("propertyMgmt.availableTimeSlots")}</Text>
              <View style={styles.legend}>
                <View style={styles.legendDot} />
                <Text style={styles.legendText}>{t("propertyMgmt.availableLegend")}</Text>
              </View>
            </View>

            {slotsLoading ? (
              <ActivityIndicator color="#1B4F8A" style={{ marginVertical: sw(20) }} />
            ) : slotsMessage ? (
              <Text style={styles.emptySlots}>{slotsMessage}</Text>
            ) : slots.length === 0 ? (
              <Text style={styles.emptySlots}>{t("propertyMgmt.noSlotsConfigured")}</Text>
            ) : (
              <View style={styles.slotGrid}>
                {slots.map((slot) => {
                  const booked = slot.available === false;
                  const active = selectedSlot === slot.value;
                  return (
                    <TouchableOpacity
                      key={slot.value}
                      disabled={booked}
                      activeOpacity={0.85}
                      onPress={() => setSelectedSlot(slot.value)}
                      style={[
                        styles.slot,
                        active && styles.slotActive,
                        booked && styles.slotBooked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotText,
                          active && styles.slotTextActive,
                          booked && styles.slotTextBooked,
                        ]}
                      >
                        {slot.label}
                      </Text>
                      {booked ? <Text style={styles.slotBookedLabel}>{t("propertyMgmt.taken")}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={{ height: sw(24) }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!canConfirm}
          onPress={confirmBooking}
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="send" size={sf(16)} color="#FFFFFF" />
              <Text style={styles.confirmText}>
                {selectedDateBooked || userAlreadyBooked
                  ? t("propertyMgmt.alreadyBookedSection")
                  : isOpenMode
                    ? selectedDate
                      ? t("propertyMgmt.requestDate", { date: formatLongDate(selectedDate) })
                      : t("propertyMgmt.selectADate")
                    : selectedSlot
                      ? t("propertyMgmt.requestSlotBtn", { slot: selectedSlot })
                      : t("propertyMgmt.selectTimeSlot")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },
  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(16),
  },
  label: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(14),
    color: Colors.textPrimary,
    marginBottom: sw(12),
  },
  openCard: {
    marginTop: sw(8),
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: sw(14),
    padding: sw(16),
    gap: sw(6),
  },
  openTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#047857",
  },
  openCopy: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#065F46",
    lineHeight: sf(18),
  },
  emptySlots: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    marginBottom: sw(12),
  },

  dateRow: { gap: sw(10), paddingBottom: sw(4) },
  dateChip: {
    width: sw(58),
    alignItems: "center",
    paddingVertical: sw(12),
    borderRadius: sw(14),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  dateChipActive: {
    backgroundColor: Colors.brandPrimaryDeep,
    borderColor: Colors.brandPrimaryDeep,
  },
  dateChipBooked: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
    opacity: 0.85,
  },
  dateWeekday: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(11),
    color: Colors.textMuted,
  },
  dateDay: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(18),
    color: Colors.textPrimary,
    marginVertical: sw(2),
  },
  dateMonth: {
    fontFamily: Fonts.medium,
    fontWeight: "500",
    fontSize: sf(10),
    color: Colors.textMuted,
  },
  dateActiveText: { color: "#FFFFFF" },
  dateBookedText: { color: "#94A3B8" },

  bookedCard: {
    marginTop: sw(8),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(14),
    padding: sw(16),
    gap: sw(6),
  },
  bookedTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#475569",
  },
  bookedCopy: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    lineHeight: sf(18),
  },

  slotHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: sw(24),
  },
  legend: { flexDirection: "row", alignItems: "center", gap: sw(6) },
  legendDot: {
    width: sw(8),
    height: sw(8),
    borderRadius: sw(4),
    backgroundColor: "#10B981",
  },
  legendText: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: Colors.textSecondary,
  },

  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: sw(10),
  },
  slot: {
    width: "47.5%",
    paddingVertical: sw(14),
    borderRadius: sw(14),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  slotActive: {
    backgroundColor: Colors.brandPrimaryDeep,
    borderColor: Colors.brandPrimaryDeep,
  },
  slotBooked: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E5E7EB",
  },
  slotText: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  slotTextActive: { color: "#FFFFFF" },
  slotTextBooked: { color: "#94A3B8" },
  slotBookedLabel: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    fontSize: sf(9),
    color: "#94A3B8",
  },

  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(10),
    paddingBottom: sw(20),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#F7F8FC",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    backgroundColor: Colors.brandPrimaryDeep,
    paddingVertical: sw(15),
    borderRadius: sw(14),
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: {
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: "#FFFFFF",
  },
});
