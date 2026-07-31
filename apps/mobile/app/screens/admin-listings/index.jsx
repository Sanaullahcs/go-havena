import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import ScreenHeader from "../../../components/layout/screen-header";
import { Fonts } from "../../../constants/font";
import { Colors } from "../../../constants/tokens";
import { sf } from "../../../utils/responsive";
import {
  approveListing,
  fetchAdminListings,
  rejectListing,
} from "../../../services/admin-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { useAppDialog } from "../../../providers/app-dialog-provider";

function formatPrice(price) {
  if (price == null || price === "") return "Free / Contact";
  const n = Number(price);
  if (Number.isNaN(n)) return String(price);
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

function ListingRow({ item, busy, onApprove, onReject }) {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>
          {item.type?.replace("_", " ")} · {formatPrice(item.price)}
        </Text>
        <Text style={styles.seller}>By {item.seller_name ?? "Resident"}</Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.rejectBtn}
          disabled={busy}
          onPress={() => onReject(item.id)}
        >
          <Text style={styles.rejectBtnText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.approveBtn}
          disabled={busy}
          onPress={() => onApprove(item.id)}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.approveBtnText}>Approve</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminListingsScreen() {
  const router = useRouter();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { runAction, showFailure } = useApiAction();
  const { showConfirm } = useAppDialog();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchAdminListings({ status: "pending", per_page: 50 });
      setListings(res.data);
    } catch (err) {
      await showFailure("Could not load listings", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const handleApprove = async (id) => {
    const confirmed = await showConfirm(
      "Approve listing",
      "This listing will go live in the marketplace.",
      { confirmLabel: "Approve" },
    );
    if (confirmed !== "confirm") return;

    setBusyId(id);
    try {
      await runAction({
        action: () => approveListing(id),
        successTitle: "Listing approved",
        successMessage: "The listing is now live in the marketplace.",
        errorTitle: "Approval failed",
        onSuccess: () => setListings((prev) => prev.filter((l) => l.id !== id)),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    const confirmed = await showConfirm(
      "Reject listing",
      "The seller will be notified.",
      { confirmLabel: "Reject", destructive: true },
    );
    if (confirmed !== "confirm") return;

    setBusyId(id);
    try {
      await runAction({
        action: () => rejectListing(id),
        successTitle: "Listing rejected",
        successMessage: "The seller has been notified.",
        errorTitle: "Reject failed",
        onSuccess: () => setListings((prev) => prev.filter((l) => l.id !== id)),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScreenHeader layout="inline" title="Pending Listings" iconOnly />

      {loading && listings.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brandPrimaryDeep} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No listings waiting for approval.</Text>
          }
          renderItem={({ item }) => (
            <ListingRow
              item={item}
              busy={busyId === item.id}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: Colors.textPrimary,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 24, paddingBottom: 32 },
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    backgroundColor: "#FAFBFC",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    color: Colors.textPrimary,
  },
  meta: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: Colors.brandPrimaryDeep,
    textTransform: "capitalize",
  },
  seller: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: Colors.textMuted,
  },
  description: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: Colors.textSecondary,
    lineHeight: sf(18),
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  rejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  rejectBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#DC2626",
  },
  approveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.brandPrimaryDeep,
    minWidth: 88,
    alignItems: "center",
  },
  approveBtnText: {
    fontFamily: Fonts.bold,
    fontSize: sf(12),
    color: "#FFFFFF",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 48,
    fontFamily: Fonts.medium,
    fontSize: sf(14),
    color: Colors.textMuted,
  },
});
