import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";

import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../../../components/layout/screen-header";
import { Fonts } from "../../../constants/font";
import { getCurrentRole } from "../../../constants/role-session";
import { MarketplaceRoutes } from "../../../constants/marketplace-routes";

const INITIAL_REVIEWS = [
  {
    id: "1",
    user: "Sarah M.",
    initials: "SM",
    rating: 5,
    date: "Feb 10, 2026",
    business: "The Daily Grind",
    text: "Great food and friendly staff. The resident discount was a nice surprise!",
    status: "approved",
    helpful: 12,
  },
  {
    id: "2",
    user: "James K.",
    initials: "JK",
    rating: 4,
    date: "Jan 28, 2026",
    business: "Green Bowl",
    text: "Solid portions and quick service. Parking can be tight on weekends.",
    status: "approved",
    helpful: 8,
  },
  {
    id: "3",
    user: "Priya N.",
    initials: "PN",
    rating: 2,
    date: "Jan 22, 2026",
    business: "Joe's Burger Bar",
    text: "Coupon did not work at checkout. Staff said the deal expired even though the app showed it active.",
    status: "flagged",
    helpful: 3,
  },
  {
    id: "4",
    user: "Marcus T.",
    initials: "MT",
    rating: 5,
    date: "Jan 15, 2026",
    business: "Zenith Fitness",
    text: "Best deal in the neighborhood — free trial week worked perfectly.",
    status: "pending",
    helpful: 5,
  },
];

const FILTER_KEYS = ["all", "pending", "flagged", "approved"];

function StarRow({ rating, size = 14 }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? "star" : "star-outline"}
          size={size}
          color={star <= rating ? "#F59E0B" : "#D1D5DB"}
        />
      ))}
    </View>
  );
}

function statusMetaColors(status) {
  if (status === "flagged") return { bg: "#FEE2E2", color: "#B91C1C" };
  if (status === "pending") return { bg: "#FEF3C7", color: "#92400E" };
  return { bg: "#DCFCE7", color: "#166534" };
}

export default function ReviewsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { vendor: vendorParam, role: roleParam } = useLocalSearchParams();
  const vendor = vendorParam || t("marketplace.communityReviews");
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();
  const isAdmin = activeRole === "admin";

  const [reviews, setReviews] = useState(INITIAL_REVIEWS);
  const [filter, setFilter] = useState("all");

  const FILTER_LABELS = {
    all: t("marketplace.allFilter"),
    pending: t("marketplace.pendingFilter"),
    flagged: t("deals.flagged"),
    approved: t("deals.approved"),
  };

  const getStatusLabel = (status) => {
    if (status === "flagged") return t("deals.flagged");
    if (status === "pending") return t("marketplace.pendingFilter");
    return t("deals.approved");
  };

  const filtered =
    filter === "all" ? reviews : reviews.filter((r) => r.status === filter);

  const stats = {
    total: reviews.length,
    pending: reviews.filter((r) => r.status === "pending").length,
    flagged: reviews.filter((r) => r.status === "flagged").length,
    avg:
      reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : "0.0",
  };

  const updateStatus = (id, status) => {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const handleApprove = (review) => {
    updateStatus(review.id, "approved");
  };

  const handleFlag = (review) => {
    Alert.alert(t("deals.flagReview"), t("deals.flagReviewMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("deals.flag"), style: "destructive", onPress: () => updateStatus(review.id, "flagged") },
    ]);
  };

  const handleRemove = (review) => {
    Alert.alert(t("deals.removeReview"), t("deals.removeReviewMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("deals.remove"),
        style: "destructive",
        onPress: () => setReviews((prev) => prev.filter((r) => r.id !== review.id)),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScreenHeader
        layout="stacked"
        title={t("marketplace.reviewModeration")}
        subtitle={String(vendor)}
        iconOnly
        right={
          !isAdmin ? (
            <TouchableOpacity
              style={styles.writeBtn}
              onPress={() =>
                router.push({
                  pathname: MarketplaceRoutes.WRITE_REVIEW,
                  params: { vendor },
                })
              }
            >
              <Text style={styles.writeBtnText}>{t("deals.write")}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>{t("deals.averageRating")}</Text>
              <View style={styles.heroRatingRow}>
                <Text style={styles.ratingBig}>{stats.avg}</Text>
                <StarRow rating={Math.round(Number(stats.avg))} size={18} />
              </View>
              <Text style={styles.heroSub}>{t("deals.basedOnReviews", { count: stats.total })}</Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Ionicons name="chatbubbles-outline" size={28} color="#14B8A6" />
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statValue}>{stats.pending}</Text>
              <Text style={styles.statLabel}>{t("marketplace.pendingFilter")}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={[styles.statValue, { color: "#B91C1C" }]}>{stats.flagged}</Text>
              <Text style={styles.statLabel}>{t("deals.flagged")}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={[styles.statValue, { color: "#166534" }]}>
                {reviews.filter((r) => r.status === "approved").length}
              </Text>
              <Text style={styles.statLabel}>{t("deals.approved")}</Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_KEYS.map((key) => {
            const active = filter === key;
            const count =
              key === "all"
                ? reviews.length
                : reviews.filter((r) => r.status === key).length;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(key)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {FILTER_LABELS[key]} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={36} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>{t("deals.noReviewsInFilter")}</Text>
            <Text style={styles.emptySub}>{t("deals.tryAnotherTab")}</Text>
          </View>
        ) : (
          filtered.map((review) => {
            const st = statusMetaColors(review.status);
            return (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHead}>
                  <View style={styles.avatarRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{review.initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewUser}>{review.user}</Text>
                      <Text style={styles.reviewBusiness}>{review.business}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{getStatusLabel(review.status)}</Text>
                  </View>
                </View>

                <View style={styles.ratingRow}>
                  <StarRow rating={review.rating} />
                  <Text style={styles.reviewDate}>{review.date}</Text>
                </View>

                <Text style={styles.reviewText}>{review.text}</Text>

                <View style={styles.cardFooter}>
                  <View style={styles.helpfulRow}>
                    <Ionicons name="thumbs-up-outline" size={14} color="#6B7280" />
                    <Text style={styles.helpfulText}>{t("deals.foundHelpful", { count: review.helpful })}</Text>
                  </View>

                  {isAdmin ? (
                    <View style={styles.actionRow}>
                      {review.status !== "approved" ? (
                        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(review)}>
                          <Ionicons name="checkmark" size={14} color="#166534" />
                          <Text style={styles.approveBtnText}>{t("marketplace.approve")}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {review.status !== "flagged" ? (
                        <TouchableOpacity style={styles.flagBtn} onPress={() => handleFlag(review)}>
                          <Ionicons name="flag-outline" size={14} color="#B45309" />
                          <Text style={styles.flagBtnText}>{t("deals.flag")}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(review)}>
                        <Ionicons name="trash-outline" size={14} color="#B91C1C" />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  writeBtn: {
    backgroundColor: "#14B8A6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  writeBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#FFFFFF",
  },
  heroCard: {
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLabel: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#1B4F8A",
  },
  heroRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  ratingBig: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.hero,
    color: "#0F172A",
    lineHeight: 40,
  },
  heroSub: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#475467",
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  statChip: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#0F172A",
  },
  statLabel: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#64748B",
  },
  filterRow: {
    gap: 8,
    paddingBottom: 14,
  },
  filterChip: {
    backgroundColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "#14B8A6",
  },
  filterText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#4B5563",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#111827",
  },
  emptySub: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    color: "#6B7280",
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    marginBottom: 12,
  },
  reviewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 184, 166, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: "#1B4F8A",
  },
  reviewUser: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    color: "#111827",
  },
  reviewBusiness: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8,
  },
  reviewDate: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#9CA3AF",
  },
  reviewText: {
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#374151",
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  helpfulRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  helpfulText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "#6B7280",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  approveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: "#166534",
  },
  flagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  flagBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: "#B45309",
  },
  removeBtn: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
});
