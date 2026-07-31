import React, { useCallback, useState } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { getCurrentRole } from "../../../constants/role-session";
import {
  MarketplaceRoutes,
  dealDetailsParams,
  providerProfileParams,
  withMarketplaceRole,
} from "../../../constants/marketplace-routes";
import { fetchBusinesses, deleteBusiness, fetchMyBusiness, approveBusiness, rejectBusiness, reapproveBusiness } from "../../../services/businesses-api";
import { fetchManageDeals, deleteDeal } from "../../../services/deals-api";
import { getUser } from "../../../services/auth-session";
import { useApiAction } from "../../../hooks/use-api-action";
import BusinessModerationSheet from "../../../components/marketplace/business-moderation-sheet";
import AdminRowActionsMenu from "../../../components/admin/admin-row-actions-menu";
import { useAppDialog } from "../../../providers/app-dialog-provider";

const BUSINESS_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Active" },
  { key: "rejected", label: "Rejected" },
];

function dealsAffectedLabel(count, verb) {
  if (!count) return `No deals were ${verb}`;
  return `${count} deal${count === 1 ? "" : "s"} ${verb}`;
}

export default function ManageAllMarketplace() {
  const router = useRouter();
  const { role: roleParam, tab: tabParam } = useLocalSearchParams();
  const activeRole =
    roleParam === "admin" || roleParam === "resident"
      ? roleParam
      : getCurrentRole();
  const isAdmin = activeRole === "admin";

  const [activeTab, setActiveTab] = useState(
    tabParam === "deals" ? "deals" : "businesses",
  );
  const [businesses, setBusinesses] = useState([]);
  const [deals, setDeals] = useState([]);
  const [myBusiness, setMyBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [moderatingId, setModeratingId] = useState(null);
  const [businessStatusFilter, setBusinessStatusFilter] = useState("all");
  const [businessStats, setBusinessStats] = useState(null);
  const [moderationSheet, setModerationSheet] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const { runAction, showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();

  const dealsForBusiness = useCallback(
    (business) =>
      deals.filter(
        (deal) =>
          Number(deal.businessId) === Number(business.id) ||
          (Number(deal.createdBy) === Number(business.ownerId) && !deal.businessId),
      ),
    [deals],
  );

  const dealStatsForBusiness = useCallback(
    (business) => {
      const related = dealsForBusiness(business);
      return {
        total: related.length,
        active: related.filter((deal) => deal.status === "active" && !deal.isExpired).length,
        inactive: related.filter((deal) => deal.status === "inactive").length,
      };
    },
    [dealsForBusiness],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const bizParams = { scope: "manage", perPage: 100 };
      if (isAdmin && businessStatusFilter !== "all") {
        bizParams.status = businessStatusFilter;
      }
      const [bizRes, dealRes, mine, user] = await Promise.all([
        fetchBusinesses(bizParams),
        fetchManageDeals({ perPage: 100 }),
        fetchMyBusiness(),
        getUser(),
      ]);
      setBusinesses(bizRes.businesses);
      setBusinessStats(bizRes.meta?.stats ?? null);
      setDeals(dealRes.deals);
      setMyBusiness(mine);
      setCurrentUserId(user?.id ?? null);
    } catch (err) {
      await showFailure("Could not load marketplace", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, businessStatusFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const listData = activeTab === "businesses" ? businesses : deals;
  const headerTitle = activeTab === "businesses" ? "Businesses" : "Deals";

  const goTo = (pathname, params = {}) => {
    router.push({
      pathname,
      params: withMarketplaceRole(activeRole, params),
    });
  };

  const goToAddOrEditBusiness = () => {
    if (myBusiness) {
      goTo(MarketplaceRoutes.ADD_BUSINESS, { editId: String(myBusiness.id) });
    } else {
      goTo(MarketplaceRoutes.ADD_BUSINESS);
    }
  };

  const promptAddBusinessFirst = () => {
    Alert.alert(
      myBusiness ? "Edit Business First" : "Add a Business First",
      "You need to register your business before you can create a deal.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: myBusiness ? "Edit Business" : "Add Business",
          onPress: goToAddOrEditBusiness,
        },
      ],
    );
  };

  const openListItem = (item) => {
    if (activeTab === "businesses") {
      goTo(MarketplaceRoutes.PROVIDER_PROFILE, providerProfileParams(item, activeRole));
      return;
    }
    goTo(
      MarketplaceRoutes.DEAL_DETAILS,
      dealDetailsParams(item, activeRole),
    );
  };

  const handleEdit = (item) => {
    if (activeTab === "businesses") {
      if (!canEditBusiness(item)) {
        Alert.alert(
          "View only",
          "You can approve, reject, re-approve, or delete resident businesses. Only the owner can edit the profile.",
        );
        return;
      }
      goTo(MarketplaceRoutes.ADD_BUSINESS, { editId: String(item.id) });
      return;
    }
    if (!canEditDeal(item)) {
      Alert.alert(
        "View only",
        "You can delete resident deals, but only the owner can edit them.",
      );
      return;
    }
    goTo(MarketplaceRoutes.CREATE_DEAL, { editId: String(item.id) });
  };

  const handleApprove = (item) => {
    setModerationSheet({
      mode: "approve",
      business: item,
      dealStats: dealStatsForBusiness(item),
    });
  };

  const handleReject = (item) => {
    setModerationSheet({
      mode: "reject",
      business: item,
      dealStats: dealStatsForBusiness(item),
    });
  };

  const closeModerationSheet = () => {
    if (moderatingId) return;
    setModerationSheet(null);
  };

  const confirmModeration = async () => {
    if (!moderationSheet?.business) return;
    const item = moderationSheet.business;
    const isReject = moderationSheet.mode === "reject";
    const isReapprove = !isReject && item.status === "rejected";

    setModeratingId(item.id);
    try {
      await runAction({
        action: async () => {
          const result = isReject
            ? await rejectBusiness(item.id)
            : isReapprove
              ? await reapproveBusiness(item.id)
              : await approveBusiness(item.id);

          return { result, isReject, isReapprove, item };
        },
        successTitle: isReject
          ? "Business rejected"
          : isReapprove
            ? "Business re-approved"
            : "Business approved",
        successMessage: isReject
          ? `${item.name} is hidden from the marketplace.`
          : isReapprove
            ? `${item.name} is live again.`
            : `${item.name} is now visible in the marketplace.`,
        errorTitle: isReject ? "Rejection failed" : "Approval failed",
        onSuccess: ({ result } = {}) => {
          const disabled = result?.meta?.deals_disabled ?? 0;
          const restored = result?.meta?.deals_reactivated ?? 0;
          if (isReject && disabled > 0) {
            Alert.alert(
              "Deals disabled",
              `${disabled} deal${disabled === 1 ? "" : "s"} ${disabled === 1 ? "was" : "were"} set to inactive.`,
            );
          } else if (!isReject && restored > 0) {
            Alert.alert(
              "Deals restored",
              `${restored} deal${restored === 1 ? "" : "s"} ${restored === 1 ? "is" : "are"} active again.`,
            );
          }
          setModerationSheet(null);
          load();
        },
      });
    } finally {
      setModeratingId(null);
    }
  };

  const handleDelete = async (item) => {
    const label = activeTab === "businesses" ? item.name : item.title;
    const confirmed = await showConfirm(
      `Delete ${activeTab === "businesses" ? "business" : "deal"}?`,
      `"${label}" will be removed permanently.`,
      { confirmLabel: "Delete", destructive: true },
    );
    if (confirmed !== "confirm") return;

    setDeletingId(item.id);
    try {
      await runAction({
        action: () =>
          activeTab === "businesses"
            ? deleteBusiness(item.id)
            : deleteDeal(item.id, { asAdmin: isAdmin }),
        successTitle: "Deleted",
        successMessage: `${label} was removed.`,
        errorTitle: "Delete failed",
        onSuccess: () => load(),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const isOwnBusiness = (item) => myBusiness && Number(item.id) === Number(myBusiness.id);
  const canEditBusiness = (item) => !isAdmin || isOwnBusiness(item);
  const canEditDeal = (item) =>
    !isAdmin || (currentUserId != null && Number(item.createdBy) === Number(currentUserId));
  const canModerateBusiness = (item) =>
    isAdmin && activeTab === "businesses" && !isOwnBusiness(item);
  const canDeleteBusiness = (item) => {
    if (activeTab !== "businesses") return true;
    if (!isAdmin) return true;
    return !isOwnBusiness(item);
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <InternalScreenHeader
        title={headerTitle}
        subtitle={
          isAdmin && activeTab === "businesses"
            ? "Moderate resident businesses — edit only your own profile"
            : "View and manage businesses and deals"
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.contentWrap}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.segmentedWrap}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.segmentButton,
              activeTab === "businesses" && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveTab("businesses")}
          >
            <Ionicons
              name="business-outline"
              size={16}
              color={
                activeTab === "businesses" ? "#FFFFFF" : "rgba(74, 85, 101, 1)"
              }
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === "businesses" && styles.segmentTextActive,
              ]}
            >
              Businesses
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.segmentButton,
              activeTab === "deals" && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveTab("deals")}
          >
            <Ionicons
              name="pricetag-outline"
              size={16}
              color={activeTab === "deals" ? "#FFFFFF" : "rgba(74, 85, 101, 1)"}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === "deals" && styles.segmentTextActive,
              ]}
            >
              Deals
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.addButton,
            {
              backgroundColor:
                activeTab === "businesses"
                  ? "rgba(242, 255, 227, 1)"
                  : "rgba(254, 243, 198, 1)",
              borderColor:
                activeTab === "businesses"
                  ? "rgba(92, 225, 230, 1)"
                  : "rgba(254, 230, 133, 1)",
            },
          ]}
          onPress={() => {
            if (activeTab === "deals") {
              if (!myBusiness && !isAdmin) {
                promptAddBusinessFirst();
                return;
              }
              if (!isAdmin && myBusiness?.status === "rejected") {
                Alert.alert(
                  "Business rejected",
                  "Your business was rejected. You cannot add deals until it is approved.",
                );
                return;
              }
              if (!isAdmin && myBusiness?.status === "pending") {
                Alert.alert(
                  "Pending approval",
                  "Your business is still pending approval. You can add deals once it is approved.",
                );
                return;
              }
              goTo(MarketplaceRoutes.CREATE_DEAL);
              return;
            }

            goToAddOrEditBusiness();
          }}
        >
          <Ionicons
            name={activeTab === "businesses" && myBusiness ? "pencil-outline" : "add"}
            size={20}
            color={
              activeTab === "businesses"
                ? "rgba(16, 185, 129, 1)"
                : "rgba(225, 113, 0, 1)"
            }
          />
          <Text
            style={[
              styles.addButtonText,
              {
                color:
                  activeTab === "businesses"
                    ? "rgba(5, 150, 105, 1)"
                    : "rgba(187, 77, 0, 1)",
              },
            ]}
          >
            {activeTab === "businesses"
            ? (myBusiness ? "Edit My Business" : "Add New Business")
            : "Add New Deal"}
          </Text>
        </TouchableOpacity>

        {isAdmin && activeTab === "businesses" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            {BUSINESS_STATUS_FILTERS.map((filter) => {
              const count =
                filter.key === "all"
                  ? businessStats?.total
                  : businessStats?.[filter.key === "approved" ? "approved" : filter.key];
              return (
                <TouchableOpacity
                  key={filter.key}
                  activeOpacity={0.85}
                  style={[
                    styles.filterChip,
                    businessStatusFilter === filter.key && styles.filterChipActive,
                  ]}
                  onPress={() => setBusinessStatusFilter(filter.key)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      businessStatusFilter === filter.key && styles.filterChipTextActive,
                    ]}
                  >
                    {filter.label}
                    {count != null ? ` (${count})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <Text style={styles.countText}>
          {listData.length} {activeTab}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#0052DF" style={{ marginTop: 24 }} />
        ) : listData.length === 0 ? (
          <Text style={styles.emptyText}>
            {activeTab === "businesses"
              ? isAdmin
                ? "No resident businesses in this community yet."
                : "No businesses yet. Add your first business above."
              : "No deals yet. Add your first deal above."}
          </Text>
        ) : (
          <View style={styles.listWrap}>
            {listData.map((item) => {
              const title = activeTab === "businesses" ? item.name : item.title;
              const subtitle =
                activeTab === "businesses"
                  ? isAdmin && item.ownerName
                    ? `${item.category || "Other"} · ${item.ownerName}`
                    : item.category
                  : item.offerTag;
              const status = activeTab === "businesses" ? item.statusLabel : item.statusLabel;

              const isExpired = activeTab === "deals" && item.isExpired;
              const isInactive = activeTab === "deals" && item.status === "inactive";
              const isRejected = activeTab === "businesses" && item.status === "rejected";
              const isMine = activeTab === "businesses" && isOwnBusiness(item);
              const showEdit =
                activeTab === "deals" ? canEditDeal(item) : canEditBusiness(item);
              const showDelete = canDeleteBusiness(item);
              const showModeration = canModerateBusiness(item);
              const isBusy = moderatingId === item.id || deletingId === item.id;
              const relatedDealStats = activeTab === "businesses" ? dealStatsForBusiness(item) : null;

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  style={[
                    styles.card,
                    isExpired && styles.cardExpired,
                    isInactive && styles.cardExpired,
                    isRejected && styles.cardRejected,
                    isMine && styles.cardMine,
                  ]}
                  onPress={() => openListItem(item)}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTextWrap}>
                      <View style={styles.titleRow}>
                        <Text style={styles.cardTitle}>{title}</Text>
                        {isMine ? (
                          <View style={styles.myBadge}>
                            <Text style={styles.myBadgeText}>My Business</Text>
                          </View>
                        ) : null}
                      </View>
                      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
                      {isAdmin && activeTab === "businesses" && relatedDealStats?.total ? (
                        <Text style={styles.dealCountText}>
                          {relatedDealStats.total} deal{relatedDealStats.total === 1 ? "" : "s"}
                          {relatedDealStats.inactive
                            ? ` · ${relatedDealStats.inactive} disabled`
                            : ""}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.actionsWrap}>
                      <AdminRowActionsMenu
                        disabled={isBusy}
                        actions={[
                          {
                            label: "Edit",
                            icon: "create-outline",
                            hidden: !showEdit,
                            onPress: () => handleEdit(item),
                          },
                          {
                            label: "Delete",
                            icon: "trash-outline",
                            tone: "danger",
                            hidden: !showDelete,
                            onPress: () => handleDelete(item),
                          },
                          {
                            label: item.status === "rejected" ? "Re-approve" : "Approve",
                            icon: "checkmark-circle-outline",
                            tone: "success",
                            hidden: !(showModeration && (item.status === "pending" || item.status === "rejected")),
                            onPress: () => handleApprove(item),
                          },
                          {
                            label: "Reject",
                            icon: "close-circle-outline",
                            tone: "danger",
                            hidden: !(showModeration && (item.status === "pending" || item.status === "approved")),
                            onPress: () => handleReject(item),
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Deal-specific meta row */}
                  {activeTab === "deals" && (item.validUntil || item.location) ? (
                    <View style={styles.metaRow}>
                      {item.validUntil ? (
                        <View style={styles.metaChip}>
                          <Ionicons name="calendar-outline" size={11} color="#6B7280" />
                          <Text style={styles.metaChipText}>
                            {isExpired ? "Expired " : "Valid until "}{item.validUntil}
                          </Text>
                        </View>
                      ) : null}
                      {item.location ? (
                        <View style={styles.metaChip}>
                          <Ionicons name="location-outline" size={11} color="#6B7280" />
                          <Text style={styles.metaChipText} numberOfLines={1}>{item.location}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.statusRow}>
                    <View style={[
                      styles.statusBadge,
                      isExpired && styles.statusBadgeExpired,
                      isInactive && styles.statusBadgeExpired,
                      item.status === "pending" && styles.statusBadgePending,
                      isRejected && styles.statusBadgeRejected,
                    ]}>
                      <Text style={[
                        styles.statusText,
                        isExpired && styles.statusTextExpired,
                        isInactive && styles.statusTextExpired,
                        item.status === "pending" && styles.statusTextPending,
                        isRejected && styles.statusTextRejected,
                      ]}>{status}</Text>
                    </View>
                    {activeTab === "deals" && item.offerTag ? (
                      <View style={styles.offerBadge}>
                        <Text style={styles.offerBadgeText}>{item.offerTag}</Text>
                      </View>
                    ) : null}
                  </View>

                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <BusinessModerationSheet
        visible={Boolean(moderationSheet)}
        mode={moderationSheet?.mode}
        business={moderationSheet?.business}
        dealStats={moderationSheet?.dealStats}
        loading={moderatingId === moderationSheet?.business?.id}
        onClose={closeModerationSheet}
        onConfirm={confirmModeration}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  contentWrap: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  segmentedWrap: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  segmentButton: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(243, 244, 246, 1)",
  },
  segmentButtonActive: {
    backgroundColor: "rgba(0, 82, 223, 1)",
  },
  segmentText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(74, 85, 101, 1)",
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "rgba(255, 255, 255, 1)",
  },
  addButton: {
    marginTop: 16,
    height: 60,
    borderWidth: 2,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  addButtonText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    lineHeight: MarketplaceType.stat,
    fontWeight: "700",
  },
  countText: {
    marginTop: 16,
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(106, 114, 130, 1)",
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 24,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(106, 114, 130, 1)",
    textAlign: "center",
  },
  listWrap: {
    marginTop: 12,
    gap: 12,
  },
  card: {
    borderWidth: 2,
    borderColor: "rgba(243, 244, 246, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderRadius: 14,
    padding: 18,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.body,
    lineHeight: MarketplaceType.headingLine,
    color: "rgba(0, 0, 0, 1)",
    fontWeight: "700",
  },
  cardSubtitle: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(74, 85, 101, 1)",
  },
  dealCountText: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  actionsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardExpired: {
    opacity: 0.7,
    borderColor: "rgba(252, 231, 231, 1)",
  },
  cardRejected: {
    borderColor: "rgba(254, 202, 202, 1)",
    backgroundColor: "rgba(254, 242, 242, 1)",
  },
  cardMine: {
    borderColor: "rgba(191, 219, 254, 1)",
    backgroundColor: "rgba(239, 246, 255, 1)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  myBadge: {
    backgroundColor: "rgba(0, 82, 223, 1)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  myBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(249,250,251,1)",
    borderWidth: 1,
    borderColor: "rgba(229,231,235,1)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaChipText: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: "rgba(74, 85, 101, 1)",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(220, 252, 231, 1)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  statusBadgeExpired: {
    backgroundColor: "rgba(254, 226, 226, 1)",
  },
  statusBadgePending: {
    backgroundColor: "rgba(254, 243, 199, 1)",
  },
  statusBadgeRejected: {
    backgroundColor: "rgba(254, 226, 226, 1)",
  },
  statusText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    lineHeight: MarketplaceType.captionLine,
    color: "rgba(0, 130, 54, 1)",
    fontWeight: "500",
  },
  statusTextExpired: {
    color: "rgba(185, 28, 28, 1)",
  },
  statusTextPending: {
    color: "rgba(146, 64, 14, 1)",
  },
  statusTextRejected: {
    color: "rgba(185, 28, 28, 1)",
  },
  offerBadge: {
    backgroundColor: "rgba(255, 237, 213, 1)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  offerBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: "rgba(194, 65, 12, 1)",
  },
  filterScroll: {
    marginTop: 16,
    marginHorizontal: -24,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(243, 244, 246, 1)",
    borderWidth: 1,
    borderColor: "rgba(229, 231, 235, 1)",
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: "rgba(0, 82, 223, 1)",
    borderColor: "rgba(0, 82, 223, 1)",
  },
  filterChipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "rgba(74, 85, 101, 1)",
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  moderationRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  modBtnApprove: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  modBtnApproveText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: "#047857",
    fontWeight: "700",
  },
  modBtnReject: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  modBtnRejectText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: "#B91C1C",
    fontWeight: "700",
  },
});
