import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  AppState,
  Modal,
} from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  fetchAchCapability,
  fetchAmenitySlots,
  fetchMyBookings,
} from "../../../../../../services/amenity-api";
import { resolveAdminPortalBaseUrl } from "../../../../../../constants/api-config";
import { createWebHandoff } from "../../../../../../services/auth-api";
import { formatCommunityMoney } from "../../../../../../utils/money";
import {
  buildUpcomingDates,
  formatLongDate,
  bookingFeeAmount,
  isDateBookedByUser,
  isFullSlotCapacity,
  maxBookableSeats,
  normalizeCapacityBookingType,
  reservationFeeTotal,
} from "../../../../../../utils/amenity-display";
import { useApiAction } from "../../../../../../hooks/use-api-action";
import { useSubmitLock } from "../../../../../../hooks/use-submit-lock";
import { SkeletonLine } from "../../../../../../components/ui/skeleton-loader";

const DATES = buildUpcomingDates(14);

export default function ReservationCalender() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { id, name, status, isMine, bookingFee, capacity, capacityBookingType, sharedBillingEnabled } = useLocalSearchParams();
  const amenityId = Number(id);
  const isOpenMode = String(status) === "open";
  const sharedBilling = String(sharedBillingEnabled) === "1" || String(sharedBillingEnabled) === "true";
  const hideGuestCount = isOpenMode || sharedBilling;
  const ownedByMe = isMine === "1" || isMine === "true";
  const unitFee = bookingFeeAmount(bookingFee);
  const amenityCapacity = Math.max(0, Number(capacity) || 0);
  const [slotCapacityType, setSlotCapacityType] = useState(() =>
    normalizeCapacityBookingType(capacityBookingType),
  );
  const fullSlot = !isOpenMode && isFullSlotCapacity(slotCapacityType);

  const [selectedDate, setSelectedDate] = useState(DATES[0]?.key ?? null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [guests, setGuests] = useState(1);
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);
  const [slots, setSlots] = useState([]);
  const [resolvedSlotKey, setResolvedSlotKey] = useState("");
  const [slotsMessage, setSlotsMessage] = useState("");
  const [userAlreadyBooked, setUserAlreadyBooked] = useState(false);
  const [myBookings, setMyBookings] = useState([]);
  const [achCapability, setAchCapability] = useState(null);
  const resumePaidBookingRef = useRef(false);
  const { runAction, dialog } = useApiAction();
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
  const selectedSlotRow = useMemo(
    () => slots.find((slot) => slot.value === selectedSlot) ?? null,
    [slots, selectedSlot],
  );
  const remainingSpots = isOpenMode
    ? amenityCapacity
    : selectedSlotRow?.remaining != null
      ? selectedSlotRow.remaining
      : amenityCapacity;
  const maxGuests = maxBookableSeats({
    capacity: amenityCapacity,
    remaining: remainingSpots,
    remainingForward: selectedSlotRow?.remaining_forward,
    fullSlot,
  });
  const bookingGuests = hideGuestCount || fullSlot ? 1 : Math.max(1, guests);
  const fee = reservationFeeTotal(unitFee, bookingGuests, fullSlot);

  useEffect(() => {
    setSlotCapacityType(normalizeCapacityBookingType(capacityBookingType));
  }, [capacityBookingType]);

  useEffect(() => {
    if (fullSlot || hideGuestCount) setGuests(1);
  }, [fullSlot, hideGuestCount]);

  useEffect(() => {
    if (!ownedByMe) return;
    router.replace(PropertyManagementRoutes.ADMIN_BOOKINGS);
  }, [ownedByMe, router]);

  const slotKey =
    !ownedByMe && amenityId && selectedDate && !isOpenMode ? `${amenityId}:${selectedDate}` : "";
  const slotsLoading = slotKey !== "" && resolvedSlotKey !== slotKey;

  const loadSlots = useCallback(async () => {
    if (ownedByMe || !amenityId || !selectedDate || isOpenMode) {
      setSlots([]);
      setSlotsMessage("");
      setUserAlreadyBooked(false);
      setResolvedSlotKey("");
      return;
    }
    const key = `${amenityId}:${selectedDate}`;
    if (isDateBookedByUser(myBookings, amenityId, selectedDate)) {
      setSlots([]);
      setUserAlreadyBooked(true);
      setSlotsMessage(t("propertyMgmt.reservationForDate"));
      setResolvedSlotKey(key);
      return;
    }
    try {
      const result = await fetchAmenitySlots(amenityId, selectedDate);
      setSlots(result.slots ?? []);
      setSlotCapacityType(
        normalizeCapacityBookingType(result.capacityBookingType ?? capacityBookingType),
      );
      setUserAlreadyBooked(Boolean(result.userAlreadyBooked));
      setSlotsMessage(
        result.userAlreadyBooked
          ? result.message || t("propertyMgmt.reservationForDate")
          : result.closed
            ? result.message || t("propertyMgmt.closedThisDay")
            : "",
      );
      setResolvedSlotKey(key);
    } catch {
      setSlots([]);
      setUserAlreadyBooked(false);
      setSlotsMessage(t("propertyMgmt.couldNotLoadSlots"));
      setResolvedSlotKey(key);
    }
  }, [amenityId, selectedDate, isOpenMode, ownedByMe, myBookings, t]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const plaidOn = Boolean(achCapability?.plaid_available && achCapability?.ach_enabled);
  const needsPlaidLink = fee > 0 && plaidOn && !achCapability?.resident?.connected;
  const waitingOnCommunityBank = fee > 0 && plaidOn && Boolean(achCapability?.resident?.connected) && !achCapability?.community?.bank_connected;
  const canChargeBank = fee > 0 && plaidOn && Boolean(achCapability?.can_pay_with_bank);
  const bankAccountLabel = [
    achCapability?.resident?.institution_name,
    achCapability?.resident?.account?.mask ? `••${achCapability.resident.account.mask}` : null,
  ].filter(Boolean).join(" ");

  const loadCapability = useCallback(async () => {
    if (fee <= 0) return null;
    try {
      const next = await fetchAchCapability();
      setAchCapability(next);
      return next;
    } catch {
      return null;
    }
  }, [fee]);

  useEffect(() => {
    void loadCapability();
  }, [loadCapability]);

  const submitReservation = useCallback((paymentMethod) => {
    return runAction({
        action: async () => bookAmenity({
          amenity_id: amenityId,
          date: selectedDate,
          time_slot: isOpenMode ? undefined : selectedSlot,
          guests: bookingGuests,
          paymentMethod,
        }),
        successTitle: t("propertyMgmt.requestSubmitted"),
        successMessage: (result) => {
          if (result?.payment_method === "bank_ach") {
            return t("propertyMgmt.bankPaymentSent");
          }
          const confirmed = result?.status === "confirmed";
          if (confirmed) {
            return t("propertyMgmt.reservationConfirmed", {
              name,
              date: isOpenMode ? formatLongDate(selectedDate) : `${formatLongDate(selectedDate)} (${selectedSlot})`,
            });
          }
          return isOpenMode
            ? t("propertyMgmt.accessRequestSent", { name, date: formatLongDate(selectedDate) })
            : t("propertyMgmt.requestSlotSent", { name, date: formatLongDate(selectedDate), slot: selectedSlot });
        },
        errorTitle: t("propertyMgmt.couldNotBook"),
        onSuccess: () => router.replace(amenityFlowRoutes(pathname).myBooking),
      });
  }, [amenityId, bookingGuests, isOpenMode, name, pathname, router, runAction, selectedDate, selectedSlot, t]);

  const openPlaid = useCallback(async () => {
    let url = `${resolveAdminPortalBaseUrl()}/payments?connect=1&from=app`;
    try {
      const code = await createWebHandoff();
      if (code) url += `&handoff=${encodeURIComponent(code)}`;
    } catch {
      // The payments page can still ask them to sign in.
    }
    resumePaidBookingRef.current = true;
    try {
      await Linking.openURL(url);
    } catch {
      resumePaidBookingRef.current = false;
      await dialog.showError(t("propertyMgmt.couldNotBook"), t("propertyMgmt.couldNotOpenPlaid"));
    }
  }, [dialog, t]);

  const resumeAfterPlaid = useCallback(async () => {
    const capability = await loadCapability();
    if (capability?.can_pay_with_bank) {
      await run(async () => {
        await submitReservation("bank_ach");
      });
    }
  }, [loadCapability, run, submitReservation]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !resumePaidBookingRef.current) return;
      resumePaidBookingRef.current = false;
      void resumeAfterPlaid();
    });
    return () => sub.remove();
  }, [resumeAfterPlaid]);

  const confirmBooking = () => {
    if (ownedByMe || !selectedDate || submitting) return;
    if (!isOpenMode && !selectedSlot) return;
    void run(async () => {
      if (fee > 0) {
        const capability = achCapability ?? await loadCapability();
        const ready = Boolean(capability?.plaid_available && capability?.ach_enabled);
        if (ready && !capability?.resident?.connected) return "plaid";
        if (ready && capability?.resident?.connected && !capability?.community?.bank_connected) {
          return null;
        }
        if (ready && capability?.can_pay_with_bank) {
          await submitReservation("bank_ach");
          return null;
        }
      }
      await submitReservation();
      return null;
    }).then((result) => {
      if (result === "plaid") void openPlaid();
    });
  };

  const canConfirm =
    !ownedByMe &&
    Boolean(selectedDate) &&
    !selectedDateBooked &&
    !userAlreadyBooked &&
    (isOpenMode || (Boolean(selectedSlot) && !slotsLoading)) &&
    !waitingOnCommunityBank &&
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
                  setGuests(1);
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
              <View style={styles.slotGrid} accessibilityLabel={t("propertyMgmt.loadingSlots")}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonLine
                    key={index}
                    width="47.5%"
                    height={sw(52)}
                    delay={index * 50}
                    style={styles.slotSkeleton}
                  />
                ))}
              </View>
            ) : slotsMessage ? (
              <View style={styles.emptyCard}>
                <Feather name="clock" size={sf(18)} color="#B45309" />
                <Text style={styles.emptyTitle}>{t("propertyMgmt.timesUnavailable")}</Text>
                <Text style={styles.emptyCopy}>{slotsMessage}</Text>
              </View>
            ) : slots.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="calendar" size={sf(18)} color="#64748B" />
                <Text style={styles.emptyTitle}>{t("propertyMgmt.noOpenSlots")}</Text>
                <Text style={styles.emptyCopy}>{t("propertyMgmt.noOpenSlotsBody")}</Text>
              </View>
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
                      onPress={() => {
                        setSelectedSlot(slot.value);
                        if (fullSlot || hideGuestCount) {
                          setGuests(1);
                          return;
                        }
                        const max = maxBookableSeats({
                          capacity: amenityCapacity,
                          remaining: slot.remaining,
                          remainingForward: slot.remaining_forward,
                        });
                        setGuests((prev) => Math.min(Math.max(1, prev), max));
                        if (!fullSlot && max > 1) setSeatPickerOpen(true);
                      }}
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
                      {booked ? (
                        <Text style={styles.slotBookedLabel}>{t("propertyMgmt.slotFull")}</Text>
                      ) : slot.remaining != null ? (
                        <Text style={styles.slotRemaining}>
                          {fullSlot
                            ? t("propertyMgmt.slotAvailable")
                            : t("propertyMgmt.spotsLeft", { count: slot.remaining })}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLine}>{t("propertyMgmt.amenityFallback")}: {name}</Text>
          <Text style={styles.summaryLine}>
            {t("propertyMgmt.selectDate")}: {selectedDate ? formatLongDate(selectedDate) : "—"}
          </Text>
          <Text style={styles.summaryLine}>
            {t("propertyMgmt.availableTimeSlots")}: {isOpenMode ? t("propertyMgmt.openAvailability") : (selectedSlot || "—")}
          </Text>
          {(isOpenMode || selectedSlot) && !selectedDateBooked ? (
            fullSlot ? (
              <Text style={styles.summaryLine}>{t("propertyMgmt.fullSlotBooksEntire", { capacity: amenityCapacity })}</Text>
            ) : hideGuestCount ? null : (
              <View style={styles.guestRow}>
                <Text style={styles.summaryLine}>{t("propertyMgmt.howManyGuests")}</Text>
                <View style={styles.guestStepper}>
                  <TouchableOpacity
                    onPress={() => setGuests((n) => Math.max(1, n - 1))}
                    style={styles.guestBtn}
                    disabled={guests <= 1}
                  >
                    <Feather name="minus" size={sf(14)} color={guests <= 1 ? "#94A3B8" : "#1B4F8A"} />
                  </TouchableOpacity>
                  <Text style={styles.guestCount}>{guests}</Text>
                  <TouchableOpacity
                    onPress={() => setGuests((n) => Math.min(maxGuests, n + 1))}
                    style={styles.guestBtn}
                    disabled={guests >= maxGuests}
                  >
                    <Feather name="plus" size={sf(14)} color={guests >= maxGuests ? "#94A3B8" : "#1B4F8A"} />
                  </TouchableOpacity>
                </View>
              </View>
            )
          ) : null}
          {fee > 0 ? (
            <View style={styles.feePanel}>
              <View style={styles.feePanelTop}>
                <Text style={styles.feeEyebrow}>{t("propertyMgmt.reservationTotal")}</Text>
                <Text style={styles.feeAmount}>{formatCommunityMoney(fee)}</Text>
              </View>
              {hideGuestCount && !fullSlot ? null : (
              <Text style={styles.feeDetail}>
                {fullSlot
                  ? t("propertyMgmt.feeForFullSlot", { amount: formatCommunityMoney(unitFee) })
                  : guests > 1
                    ? t("propertyMgmt.feePerGuest", {
                        amount: formatCommunityMoney(unitFee),
                        count: guests,
                      })
                    : t("propertyMgmt.feeForOneGuest")}
              </Text>
              )}
              <Text style={styles.feeNote}>
                {canChargeBank
                  ? t("propertyMgmt.feeBankAccountNote", {
                      account: bankAccountLabel || t("propertyMgmt.yourBank"),
                    })
                  : needsPlaidLink
                    ? t("propertyMgmt.feeConnectNote")
                    : plaidOn
                      ? t("propertyMgmt.feeBankNote")
                      : t("propertyMgmt.feeApprovalNote")}
              </Text>
            </View>
          ) : (
            <Text style={styles.feeComplimentary}>{t("propertyMgmt.complimentaryReservation")}</Text>
          )}
        </View>

        <View style={{ height: sw(24) }} />
      </ScrollView>

      <View style={styles.footer}>
        {waitingOnCommunityBank ? (
          <View style={styles.bankNotice}>
            <Text style={styles.bankNoticeTitle}>{t("propertyMgmt.yourBankConnected")}</Text>
            <Text style={styles.bankNoticeBody}>{t("propertyMgmt.receivingAccountMissingBody")}</Text>
          </View>
        ) : null}
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
                  : waitingOnCommunityBank
                    ? t("propertyMgmt.receivingAccountNeeded")
                    : needsPlaidLink
                      ? t("propertyMgmt.connectBankToReserve")
                      : canChargeBank
                      ? t("propertyMgmt.confirmReservationAmount", { amount: formatCommunityMoney(fee) })
                      : isOpenMode
                        ? selectedDate
                          ? t("propertyMgmt.requestDate", { date: formatLongDate(selectedDate) })
                          : t("propertyMgmt.selectADate")
                        : slotsLoading
                          ? t("propertyMgmt.loadingSlots")
                        : selectedSlot
                          ? t("propertyMgmt.requestSlotBtn", { slot: selectedSlot })
                          : t("propertyMgmt.selectTimeSlot")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={seatPickerOpen && !hideGuestCount}
        transparent
        animationType="fade"
        onRequestClose={() => setSeatPickerOpen(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{t("propertyMgmt.howManyGuests")}</Text>
            {selectedSlotRow?.remaining != null &&
            selectedSlotRow.remaining_forward != null &&
            selectedSlotRow.remaining_forward > selectedSlotRow.remaining ? (
              <Text style={styles.pickerHint}>{t("propertyMgmt.overflowHint", { count: selectedSlotRow.remaining })}</Text>
            ) : null}
            <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
              {Array.from({ length: maxGuests }, (_, index) => index + 1).map((count) => {
                const active = guests === count;
                return (
                  <TouchableOpacity
                    key={count}
                    style={[styles.pickerOption, active && styles.pickerOptionActive]}
                    onPress={() => {
                      setGuests(count);
                      setSeatPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]}>
                      {t("propertyMgmt.guestOption", { count })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.pickerClose} onPress={() => setSeatPickerOpen(false)}>
              <Text style={styles.pickerCloseText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  emptyCard: {
    marginTop: sw(4),
    marginBottom: sw(12),
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(14),
    padding: sw(16),
    gap: sw(6),
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: "#334155",
  },
  emptyCopy: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: "#64748B",
    lineHeight: sf(18),
  },
  slotSkeleton: {
    borderRadius: sw(14),
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
  slotRemaining: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    fontSize: sf(9),
    color: "#0D9488",
  },

  bankNotice: {
    marginBottom: sw(10),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  bankNoticeTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: "#92400E",
  },
  bankNoticeBody: {
    marginTop: sw(4),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(18),
    color: "#78350F",
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
  summaryCard: {
    marginTop: sw(16),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: sw(14),
    padding: sw(14),
    gap: sw(6),
  },
  summaryLine: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  summaryFee: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    color: Colors.textPrimary,
    marginTop: sw(4),
  },
  feePanel: {
    marginTop: sw(8),
    backgroundColor: "#F4F7FB",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
    gap: sw(4),
  },
  feePanelTop: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: sw(12),
  },
  feeEyebrow: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    letterSpacing: 0.4,
    color: "#5B6B7C",
    textTransform: "uppercase",
  },
  feeAmount: {
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    color: "#1B4F8A",
  },
  feeDetail: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  feeNote: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#5B6B7C",
  },
  feeComplimentary: {
    marginTop: sw(6),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#1B4F8A",
  },
  guestRow: {
    marginTop: sw(4),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  guestStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
  },
  guestBtn: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(8),
    borderWidth: 1,
    borderColor: "#D0D5DD",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  guestCount: {
    minWidth: sw(20),
    textAlign: "center",
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  payCard: {
    marginTop: sw(12),
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: sw(14),
    padding: sw(14),
    gap: sw(8),
  },
  payCopy: {
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#92400E",
    lineHeight: sf(18),
  },
  fileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(12),
  },
  fileBtnText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textPrimary,
  },
  noteInput: {
    minHeight: sw(72),
    textAlignVertical: "top",
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: {
    flexShrink: 1,
    fontFamily: Fonts.bold,
    fontWeight: "700",
    fontSize: sf(15),
    color: "#FFFFFF",
    textAlign: "center",
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: sw(24),
  },
  pickerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    padding: sw(16),
    maxHeight: "70%",
  },
  pickerTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  pickerHint: {
    marginTop: sw(6),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  pickerList: {
    marginTop: sw(12),
    maxHeight: sw(280),
  },
  pickerListContent: {
    gap: sw(8),
  },
  pickerOption: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: sw(12),
    paddingVertical: sw(12),
    paddingHorizontal: sw(14),
  },
  pickerOptionActive: {
    borderColor: "#1B4F8A",
    backgroundColor: "#E8F0F7",
  },
  pickerOptionText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: Colors.textPrimary,
  },
  pickerOptionTextActive: {
    color: "#1B4F8A",
  },
  pickerClose: {
    marginTop: sw(12),
    alignItems: "center",
    paddingVertical: sw(10),
  },
  pickerCloseText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: "#64748B",
  },
});
