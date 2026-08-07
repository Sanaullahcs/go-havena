import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "../../constants/font";
import CrispImage from "../ui/crisp-image";
import { formatListingPrice } from "./listing-grid-card";

function parseAmount(value) {
  const parsed = parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function OfferChip({ label, active, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ListingOfferSheet({
  visible,
  listing,
  loading = false,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("list");

  const quickNotes = useMemo(() => [
    t("marketplace.canPickUpToday"),
    t("marketplace.isStillAvailable"),
    t("marketplace.wouldYouAccept"),
  ], [t]);

  const listPrice = listing?.price != null ? Number(listing.price) : null;

  useEffect(() => {
    if (visible && listing) {
      setAmount(listing.price != null ? String(listing.price) : "");
      setMessage("");
      setSelectedPreset("list");
    }
  }, [visible, listing?.id]);

  const parsedAmount = parseAmount(amount);
  const canSubmit = !loading && parsedAmount != null && parsedAmount >= 0;

  const savings = useMemo(() => {
    if (listPrice == null || parsedAmount == null || parsedAmount >= listPrice) return null;
    const diff = listPrice - parsedAmount;
    const pct = Math.round((diff / listPrice) * 100);
    return { diff, pct };
  }, [listPrice, parsedAmount]);

  const presets = useMemo(() => {
    if (listPrice == null || listPrice <= 0) {
      return [{ key: "list", label: t("marketplace.listPrice"), value: listPrice ?? 0 }];
    }
    return [
      { key: "10", label: t("marketplace.tenPercentOff"), value: Math.max(0, Math.round(listPrice * 0.9)) },
      { key: "15", label: t("marketplace.fifteenPercentOff"), value: Math.max(0, Math.round(listPrice * 0.85)) },
      { key: "20", label: t("marketplace.twentyPercentOff"), value: Math.max(0, Math.round(listPrice * 0.8)) },
      { key: "list", label: t("marketplace.listPrice"), value: listPrice },
    ];
  }, [listPrice, t]);

  const applyPreset = (preset) => {
    setSelectedPreset(preset.key);
    setAmount(String(preset.value));
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({
      offerAmount: parsedAmount,
      message: message.trim(),
    });
  };

  if (!listing) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons name="pricetag" size={18} color="#FFFFFF" />
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                disabled={loading}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.heroTitle}>{t("marketplace.makeAnOffer")}</Text>
            <Text style={styles.heroSubtitle}>
              {t("marketplace.offerGoesToSeller")}
            </Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.listingCard}>
              {listing.image_url || listing.images?.[0] ? (
                <CrispImage
                  source={listing.image_url || listing.images?.[0]}
                  style={styles.listingThumb}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.listingThumb, styles.listingThumbPlaceholder]}>
                  <Ionicons name="image-outline" size={18} color="#9CA3AF" />
                </View>
              )}
              <View style={styles.listingCopy}>
                <Text style={styles.listingTitle} numberOfLines={2}>
                  {listing.title}
                </Text>
                <View style={styles.listingMetaRow}>
                  <Text style={styles.listingPriceLabel}>{t("marketplace.listedAt")}</Text>
                  <Text style={styles.listingPrice}>{formatListingPrice(listing.price)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.fieldLabel}>{t("marketplace.quickOffers")}</Text>
            <View style={styles.chipRow}>
              {presets.map((preset) => (
                <OfferChip
                  key={preset.key}
                  label={preset.label}
                  active={selectedPreset === preset.key}
                  disabled={loading}
                  onPress={() => applyPreset(preset)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t("marketplace.yourOfferAmount")}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                value={amount}
                onChangeText={(value) => {
                  setAmount(value);
                  setSelectedPreset(null);
                }}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                style={styles.amountInput}
                editable={!loading}
              />
            </View>

            {savings ? (
              <View style={styles.savingsPill}>
                <Ionicons name="trending-down" size={14} color="#059669" />
                <Text style={styles.savingsText}>
                  {t("marketplace.belowList", { amount: formatListingPrice(savings.diff), pct: savings.pct })}
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>{t("marketplace.addNoteOptional")}</Text>
            <View style={styles.noteChipRow}>
              {quickNotes.map((note) => (
                <OfferChip
                  key={note}
                  label={note}
                  active={message === note}
                  disabled={loading}
                  onPress={() => setMessage(message === note ? "" : note)}
                />
              ))}
            </View>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t("marketplace.tellSellerInterest")}
              placeholderTextColor="#9CA3AF"
              style={styles.messageInput}
              multiline
              maxLength={500}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              activeOpacity={0.9}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                  <Text style={styles.submitText}>
                    {parsedAmount != null ? t("marketplace.sendOfferWithPrice", { price: formatListingPrice(parsedAmount) }) : t("marketplace.sendOffer")}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              {t("marketplace.offersDisclaimer")}
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    marginTop: 8,
    marginBottom: 0,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: "#14B8A6",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: 22,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  heroSubtitle: {
    marginTop: 6,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.78)",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  listingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 18,
  },
  listingThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  listingThumbPlaceholder: {
    backgroundColor: "#EEF0F3",
    alignItems: "center",
    justifyContent: "center",
  },
  listingCopy: {
    flex: 1,
    minWidth: 0,
  },
  listingTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#111827",
    fontWeight: "700",
  },
  listingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  listingPriceLabel: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#64748B",
  },
  listingPrice: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: "#059669",
    fontWeight: "700",
  },
  fieldLabel: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  noteChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipActive: {
    backgroundColor: "#D1FAF5",
    borderColor: "#93C5FD",
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#4B5563",
  },
  chipTextActive: {
    color: "#0A2A43",
    fontWeight: "600",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  currency: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: "#111827",
    marginEnd: 4,
  },
  amountInput: {
    flex: 1,
    minHeight: 54,
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: "#111827",
    paddingVertical: 10,
  },
  savingsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginBottom: 16,
  },
  savingsText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#047857",
  },
  messageInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    textAlignVertical: "top",
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#14B8A6",
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitText: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  disclaimer: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: "#94A3B8",
    textAlign: "center",
  },
});
