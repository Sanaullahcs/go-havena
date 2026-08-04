import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import ProfilePhotoAvatar from "../../../components/profile/profile-photo-avatar";
import { propertyStyles } from "../../../constants/property-styles";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import { formatDisplayDate } from "../../../utils/form-datetime";
import { formatDisplayEmail } from "../../../utils/form-validation";
import { toDisplayPhone } from "../../../utils/phone";
import { fetchMyFamily } from "../../../services/family-api";
import { fetchNeighbor } from "../../../services/profile-api";
import { resolveMediaUrl } from "../../../utils/profile-display";

const STATUS_META = {
  head: { label: "Family Head", bg: "#D1FAF5", color: "#0A2A43", border: "rgba(20, 184, 166, 0.28)" },
  active: { label: "Active", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
  pending: { label: "Pending", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  suspended: { label: "Suspended", bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
  blocked: { label: "Blocked", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
};

function familyRoleLabel(role) {
  if (role === "head") return "Family Head";
  return "Family Member";
}

function communityRoleLabel(role) {
  if (role === "community_admin" || role === "admin") return "Community admin";
  if (role === "guest") return "Guest";
  if (!role) return null;
  return "Resident";
}

function residenceLabel(type) {
  if (type === "homeowner") return "Homeowner";
  if (type === "tenant") return "Tenant";
  return null;
}

function resolveStatusKey(member) {
  if (member?.role === "head") return "head";
  return member?.status ?? "active";
}

function DetailRow({ icon, label, value, last = false }) {
  if (value == null || value === "") return null;
  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      <View style={styles.detailIcon}>
        <Feather name={icon} size={sf(14)} color="#0A2A43" />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

export default function FamilyMemberDetailScreen() {
  const params = useLocalSearchParams();
  const userId = String(params.userId ?? "").trim();

  const [member, setMember] = useState(null);
  const [family, setFamily] = useState(null);
  const [neighbor, setNeighbor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setError("Member not found.");
      setMember(null);
      setFamily(null);
      setNeighbor(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const data = await fetchMyFamily();
      const familyData = data?.family ?? null;
      const members = familyData?.members ?? [];
      const found = members.find((m) => String(m.user_id) === userId) ?? null;

      if (!found) {
        setMember(null);
        setFamily(familyData);
        setNeighbor(null);
        setError("This person is not in your family.");
        return;
      }

      setMember(found);
      setFamily(familyData);

      try {
        const neighborData = await fetchNeighbor(userId);
        setNeighbor(neighborData);
      } catch {
        setNeighbor(null);
      }
    } catch (err) {
      setMember(null);
      setFamily(null);
      setNeighbor(null);
      setError(err?.message || "Could not load member details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const user = member?.user ?? {};
  const statusKey = resolveStatusKey(member);
  const status = STATUS_META[statusKey] ?? STATUS_META.active;
  const displayName = neighbor?.displayName || user.name || "Member";
  const avatarUrl = resolveMediaUrl(neighbor?.avatar_url || user.avatar_url);
  const unitNumber = neighbor?.unitNumber || user.unit_number || null;
  const bio = neighbor?.bio?.trim() || "";
  const residence = residenceLabel(neighbor?.residence_type);
  const communityRole = communityRoleLabel(neighbor?.role);
  const communityName = neighbor?.communityName || family?.community_name || null;
  const joinedLabel = member?.joined_at ? formatDisplayDate(member.joined_at) : null;
  const phoneLabel = toDisplayPhone(user.phone) || null;
  const emailLabel = formatDisplayEmail(user.email) || null;

  const detailRows = useMemo(() => {
    const rows = [
      { icon: "award", label: "Family role", value: familyRoleLabel(member?.role) },
      { icon: "activity", label: "Family status", value: status.label },
      { icon: "heart", label: "Relationship", value: member?.relationship || null },
      { icon: "phone", label: "Phone", value: phoneLabel },
      { icon: "mail", label: "Email", value: emailLabel },
      { icon: "home", label: "Unit number", value: unitNumber ? `Unit ${unitNumber}` : null },
      { icon: "users", label: "Community role", value: communityRole },
      { icon: "map-pin", label: "Community", value: communityName },
      { icon: "briefcase", label: "Residence", value: residence },
      { icon: "calendar", label: "Joined family", value: joinedLabel },
      { icon: "hash", label: "Family number", value: family?.family_number || null },
    ].filter((row) => row.value);

    return rows;
  }, [
    member?.role,
    member?.relationship,
    status.label,
    phoneLabel,
    emailLabel,
    unitNumber,
    communityRole,
    communityName,
    residence,
    joinedLabel,
    family?.family_number,
  ]);

  return (
    <SafeAreaView style={propertyStyles.screenMuted} edges={["left", "right"]}>
      <InternalScreenHeader title="Member profile" subtitle={displayName !== "Member" ? displayName : undefined} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0A2A43" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={styles.errorIcon}>
            <Feather name="user-x" size={sf(28)} color="#94A3B8" />
          </View>
          <Text style={styles.errorTitle}>Profile unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : member ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor="#0A2A43"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <ProfilePhotoAvatar avatarUrl={avatarUrl} size={sw(84)} />
            <Text style={styles.name}>{displayName}</Text>
            <View style={styles.chipRow}>
              <View style={[styles.chip, { backgroundColor: status.bg, borderColor: status.border }]}>
                <Text style={[styles.chipText, { color: status.color }]}>{status.label}</Text>
              </View>
              {member.relationship ? (
                <View style={[styles.chip, styles.chipNeutral]}>
                  <Text style={styles.chipNeutralText}>{member.relationship}</Text>
                </View>
              ) : null}
            </View>
            {bio ? (
              <Text style={styles.bio}>{bio}</Text>
            ) : (
              <Text style={styles.bioEmpty}>No bio shared yet.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Details</Text>
            {detailRows.map((row, index) => (
              <DetailRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                value={row.value}
                last={index === detailRows.length - 1}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(28),
    gap: sw(8),
  },
  content: {
    paddingHorizontal: sw(16),
    paddingTop: sw(8),
    paddingBottom: sw(32),
    gap: sw(12),
  },
  errorIcon: {
    width: sw(56),
    height: sw(56),
    borderRadius: sw(18),
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(4),
  },
  errorTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(16),
    color: "#0F172A",
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(18),
    color: "#64748B",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: sw(6),
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: sw(10),
    backgroundColor: "#D1FAF5",
  },
  retryText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#0A2A43",
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: sw(16),
    paddingTop: sw(20),
    paddingBottom: sw(16),
    alignItems: "center",
  },
  name: {
    marginTop: sw(12),
    fontFamily: Fonts.bold,
    fontSize: sf(20),
    lineHeight: sf(26),
    color: "#0F172A",
    textAlign: "center",
  },
  chipRow: {
    marginTop: sw(10),
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: sw(6),
  },
  chip: {
    borderRadius: sw(999),
    paddingHorizontal: sw(10),
    paddingVertical: sw(4),
    borderWidth: 1,
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
  },
  chipNeutral: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  chipNeutralText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    color: "#475569",
  },
  bio: {
    marginTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(19),
    color: "#475569",
    textAlign: "center",
  },
  bioEmpty: {
    marginTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: "#94A3B8",
    textAlign: "center",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: sw(14),
    paddingTop: sw(14),
    paddingBottom: sw(4),
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: "#0F172A",
    marginBottom: sw(4),
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(10),
    paddingVertical: sw(12),
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  detailIcon: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(9),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
  },
  detailValue: {
    flex: 1.2,
    textAlign: "right",
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    color: "#0F172A",
  },
});
