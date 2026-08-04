import React, { useState, useCallback } from "react";
import { MarketplaceType } from "../../../constants/marketplace-type";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CrispImage from "../../../components/ui/crisp-image";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import { Fonts } from "../../../constants/font";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MarketplaceRoutes, withMarketplaceRole } from "../../../constants/marketplace-routes";
import { fetchBusiness } from "../../../services/businesses-api";
import { fetchBusinessDeals } from "../../../services/deals-api";

const BIZ_PLACEHOLDER = require("../../../assets/images/ok-resturant.png");

function InfoTile({ icon, label, value, isLast = false }) {
  if (!value) return null;
  return (
    <View style={[styles.infoTile, isLast && styles.infoTileLast]}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={18} color="#0A2A43" />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function statusStyles(status) {
  if (status === "approved") return { bg: "#ECFDF5", text: "#047857", label: "Active" };
  if (status === "pending") return { bg: "#FFFBEB", text: "#B45309", label: "Pending" };
  if (status === "rejected") return { bg: "#FEF2F2", text: "#B91C1C", label: "Rejected" };
  return { bg: "#F3F4F6", text: "#4B5563", label: status ?? "Unknown" };
}

export default function ProviderProfileScreen() {
  const router = useRouter();
  const {
    id,
    vendor: vendorParam = "Local Business",
    service: serviceParam = "",
    role,
  } = useLocalSearchParams();

  const activeRole = role === "admin" || role === "resident" ? role : "resident";

  const [business, setBusiness] = useState(null);
  const [dealCount, setDealCount] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);

  const loadBusiness = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [data, dealsRes] = await Promise.all([
        fetchBusiness(id),
        fetchBusinessDeals(id, { perPage: 1 }).catch(() => ({ deals: [], meta: {} })),
      ]);
      setBusiness(data);
      setDealCount(dealsRes.meta?.total ?? dealsRes.deals?.length ?? 0);
    } catch (err) {
      setError(err?.message || "Could not load business.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadBusiness();
    }, [loadBusiness]),
  );

  const name = business?.name ?? vendorParam;
  const category = business?.category ?? serviceParam;
  const address = business?.address ?? "";
  const phone = business?.phone ?? "";
  const hours = business?.hours ?? "";
  const amenities = business?.amenities ?? "";
  const imageUrl = business?.imageUrl ?? null;
  const description = business?.description ?? "";
  const ownerName = business?.ownerName ?? "";
  const statusPalette = statusStyles(business?.status);

  const amenityList = amenities
    ? amenities.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const openBusinessDeals = () => {
    router.push({
      pathname: MarketplaceRoutes.BUSINESS_DEALS,
      params: withMarketplaceRole(activeRole, {
        businessId: String(id ?? business?.id ?? ""),
        businessName: name,
      }),
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader title="Business Profile" />

      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color="#0A2A43" size="large" />
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadBusiness} style={styles.retryLink}>
            <Text style={styles.retryLinkText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.heroWrap}>
            <CrispImage
              source={imageUrl || BIZ_PLACEHOLDER}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition="center"
              transition={200}
            />
            <View
              style={[styles.heroFade, { backgroundColor: "rgba(248, 250, 252, 0.55)" }]}
              pointerEvents="none"
            />
          </View>

          <View style={styles.profileCard}>
            {(category || business?.status) ? (
              <View style={styles.badgeRow}>
                {category ? (
                  <View style={styles.categoryPill}>
                    <Ionicons name="storefront-outline" size={13} color="#0A2A43" />
                    <Text style={styles.categoryPillText}>{category}</Text>
                  </View>
                ) : null}
                {business?.status ? (
                  <View style={[styles.statusPill, { backgroundColor: statusPalette.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusPalette.text }]} />
                    <Text style={[styles.statusPillText, { color: statusPalette.text }]}>
                      {statusPalette.label}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.name}>{name}</Text>
            {ownerName ? (
              <Text style={styles.ownerText}>Listed by {ownerName}</Text>
            ) : null}
            {description ? (
              <Text style={styles.descText}>{description}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{dealCount ?? "—"}</Text>
                <Text style={styles.statLabel}>Active deals</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{amenityList.length || "—"}</Text>
                <Text style={styles.statLabel}>Highlights</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Contact & hours</Text>
            <InfoTile icon="location-outline" label="Address" value={address} />
            <InfoTile icon="call-outline" label="Phone" value={phone} />
            <InfoTile icon="time-outline" label="Hours" value={hours} isLast />
          </View>

          {amenityList.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Amenities & services</Text>
              <View style={styles.chipRow}>
                {amenityList.map((item) => (
                  <View key={item} style={styles.chip}>
                    <Text style={styles.chipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.dealsBtn}
            onPress={openBusinessDeals}
          >
            <View style={styles.dealsBtnInner}>
              <View style={styles.dealsBtnIcon}>
                <Ionicons name="pricetags" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.dealsBtnCopy}>
                <Text style={styles.dealsBtnText}>View Active Deals</Text>
                <Text style={styles.dealsBtnSubtext}>
                  {dealCount != null
                    ? `${dealCount} offer${dealCount === 1 ? "" : "s"} from this business`
                    : "Browse offers from this business"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  errorText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
    color: "#EF4444",
    textAlign: "center",
  },
  retryLink: { marginTop: 4 },
  retryLinkText: {
    color: "#0A2A43",
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.body,
  },
  scroll: { paddingBottom: 32 },
  heroWrap: {
    height: 220,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    position: "relative",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#D1FAF5",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.28)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryPillText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    color: "#0A2A43",
    fontWeight: "700",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.caption,
    fontWeight: "700",
  },
  profileCard: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  name: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.title,
    lineHeight: MarketplaceType.titleLine,
    color: "#0F172A",
    fontWeight: "700",
  },
  ownerText: {
    marginTop: 4,
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#64748B",
  },
  descText: {
    marginTop: 10,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    lineHeight: MarketplaceType.bodyMdLine,
    color: "#475467",
  },
  statsRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingVertical: 12,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.stat,
    color: "#0A2A43",
    fontWeight: "700",
  },
  statLabel: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "#64748B",
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E5E7EB",
  },
  sectionCard: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.heading,
    color: "#111827",
    marginBottom: 12,
    fontWeight: "700",
  },
  infoTile: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  infoTileLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1 },
  infoLabel: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#6B7280",
  },
  infoValue: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.bodyMd,
    color: "#111827",
    lineHeight: MarketplaceType.bodyMdLine,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: MarketplaceType.caption,
    color: "#047857",
  },
  dealsBtn: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#0A2A43",
    shadowColor: "#0A2A43",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  dealsBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  dealsBtnIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  dealsBtnCopy: { flex: 1 },
  dealsBtnText: {
    fontFamily: Fonts.bold,
    fontSize: MarketplaceType.bodyMd,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  dealsBtnSubtext: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: MarketplaceType.caption,
    color: "rgba(255,255,255,0.82)",
  },
});
