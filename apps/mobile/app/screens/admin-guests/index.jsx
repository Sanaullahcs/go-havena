import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import ScreenHeader from "../../../components/layout/screen-header";
import { AdminTheme, adminSharedStyles } from "../../../constants/admin-theme";
import { Fonts } from "../../../constants/font";
import { sf, sw } from "../../../utils/responsive";
import { fetchAdminGuests, revokeAdminGuest } from "../../../services/guests-api";
import { useApiAction } from "../../../hooks/use-api-action";
import { Image } from "expo-image";
import { resolveMediaUrl } from "../../../utils/profile-display";
import { formatDisplayDate, formatDisplayTime } from "../../../utils/form-datetime";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending_verification", label: "Pending" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

const STATUS_META = {
  active: {
    label: "Active",
    bg: "#ECFDF5",
    text: "#047857",
    border: "#A7F3D0",
    accent: "#10B981",
    icon: "check-circle",
  },
  pending_verification: {
    label: "Pending verification",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
    accent: "#2563EB",
    icon: "smartphone",
  },
  pending_approval: {
    label: "Pending approval",
    bg: "#FFFBEB",
    text: "#B45309",
    border: "#FDE68A",
    accent: "#D97706",
    icon: "clock",
  },
  expired: {
    label: "Expired",
    bg: "#F8FAFC",
    text: "#64748B",
    border: "#E2E8F0",
    accent: "#94A3B8",
    icon: "minus-circle",
  },
  revoked: {
    label: "Revoked",
    bg: "#F8FAFC",
    text: "#64748B",
    border: "#E2E8F0",
    accent: "#94A3B8",
    icon: "slash",
  },
  rejected: {
    label: "Rejected",
    bg: "#FEF2F2",
    text: "#B91C1C",
    border: "#FECACA",
    accent: "#DC2626",
    icon: "x-circle",
  },
};

function guestStatusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.expired;
}

function relTime(ts) {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatAccessWindow(startsAt, endsAt) {
  if (!startsAt || !endsAt) return "Access window not set";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Access window not set";
  return `${formatDisplayDate(start)} ${formatDisplayTime(start)} – ${formatDisplayDate(end)} ${formatDisplayTime(end)}`;
}

function initials(name) {
  const parts = String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function StatChip({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: AdminTheme.surface, text: AdminTheme.text, sub: AdminTheme.textMuted },
    active: { bg: AdminTheme.emerald.bg, text: AdminTheme.emerald.text, sub: "#059669" },
    pending: { bg: AdminTheme.amber.bg, text: AdminTheme.amber.text, sub: "#D97706" },
  };
  const palette = tones[tone] ?? tones.default;

  return (
    <View style={[styles.statChip, { backgroundColor: palette.bg, borderColor: palette.sub + "33" }]}>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.sub }]}>{label}</Text>
    </View>
  );
}

function GuestCard({ item, revoking, onRevoke }) {
  const status = guestStatusMeta(item.status);
  const isActive = item.status === "active";
  const avatarUrl = resolveMediaUrl(item.guest_avatar_url);
  const hostLabel =
    item.invitation_type === "resident" && item.resident
      ? item.resident.display_name || item.resident.name
      : item.invited_by?.display_name || item.invited_by?.name;

  return (
    <View style={[styles.card, { borderLeftColor: status.accent }]}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: `${status.accent}18`, borderColor: `${status.accent}40` }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Text style={[styles.avatarText, { color: status.text }]}>{initials(item.guest_name)}</Text>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.guest_name}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.border }]}>
                <Feather name={status.icon} size={sf(10)} color={status.text} />
                <Text style={[styles.statusPillText, { color: status.text }]} numberOfLines={1}>
                  {status.label}
                </Text>
              </View>
              <View style={[styles.inviteTypePill, item.invitation_type === "admin" && styles.inviteTypePillAdmin]}>
                <Text style={[styles.inviteTypePillText, item.invitation_type === "admin" && styles.inviteTypePillTextAdmin]}>
                  {item.invitation_type === "admin" ? "Admin invite" : "Resident invite"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Feather name="phone" size={sf(12)} color="#94A3B8" />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.guest_phone || "No phone"}
            </Text>
          </View>

          {item.guest_email ? (
            <View style={styles.metaRow}>
              <Feather name="mail" size={sf(12)} color="#94A3B8" />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.guest_email}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.infoBlock}>
        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Feather name="calendar" size={sf(13)} color={AdminTheme.accent} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoLabel}>Access window</Text>
            <Text style={styles.infoValue}>{formatAccessWindow(item.starts_at, item.ends_at)}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Feather name="key" size={sf(13)} color={AdminTheme.accent} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoLabel}>Invite code</Text>
            <Text style={styles.codeValue}>{item.invite_code || "—"}</Text>
          </View>
        </View>

        {hostLabel ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrap}>
              <Feather
                name={item.invitation_type === "resident" ? "home" : "shield"}
                size={sf(13)}
                color={AdminTheme.accent}
              />
            </View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>
                {item.invitation_type === "resident" ? "Resident invite" : "Invited by admin"}
              </Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {hostLabel}
                {item.resident?.unit_number ? ` · Unit ${item.resident.unit_number}` : ""}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerMeta}>
          <Feather name="clock" size={sf(11)} color="#94A3B8" />
          <Text style={styles.footerMetaText}>
            Invited {relTime(item.created_at) ?? "recently"}
            {item.last_activity_at ? ` · Last active ${relTime(item.last_activity_at)}` : ""}
          </Text>
        </View>

        {isActive ? (
          <Pressable
            style={[styles.revokeBtn, revoking && styles.revokeBtnDisabled]}
            onPress={() => onRevoke(item)}
            disabled={revoking}
          >
            {revoking ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <>
                <Feather name="slash" size={sf(14)} color="#DC2626" />
                <Text style={styles.revokeText}>Revoke</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function AdminGuestsScreen() {
  const router = useRouter();
  const { dialog, showFailure, showSuccess } = useApiAction();
  const [guests, setGuests] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending_verification: 0, pending_approval: 0 });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchAdminGuests({
        status: filter,
        search: search.trim() || undefined,
      });
      setGuests(res.guests ?? []);
      if (res.meta?.stats) {
        setStats(res.meta.stats);
      }
    } catch (err) {
      await showFailure("Could not load guests", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, search, showFailure]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [filter]);

  const pendingTotal = (stats.pending_verification ?? 0) + (stats.pending_approval ?? 0);

  const filterCounts = useMemo(
    () => ({
      all: stats.total ?? guests.length,
      active: stats.active ?? 0,
      pending_verification: pendingTotal,
      expired: stats.expired ?? 0,
      revoked: stats.revoked ?? 0,
    }),
    [stats, guests.length, pendingTotal],
  );

  const handleRevoke = async (guest) => {
    const result = await dialog.showConfirm(
      "Revoke guest access?",
      `${guest.guest_name} will be logged out and cannot access the community until re-invited.`,
      { confirmLabel: "Revoke", destructive: true },
    );
    if (result !== "confirm") return;

    setRevokingId(guest.id);
    try {
      await revokeAdminGuest(guest.id);
      await showSuccess("Access revoked", "The guest can no longer access the community.");
      load();
    } catch (err) {
      await showFailure("Revoke failed", err);
    } finally {
      setRevokingId(null);
    }
  };

  const emptyMessage =
    filter === "active"
      ? "No active guests right now."
      : filter === "pending_verification"
        ? "No pending guest invitations."
        : filter === "expired"
          ? "No expired guest passes."
          : search.trim()
            ? "No guests match your search."
            : "No guest invitations yet.";

  if (loading) {
    return (
      <SafeAreaView style={adminSharedStyles.screen} edges={["left", "right"]}>
        <ScreenHeader title="Guest Users" onBack={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={AdminTheme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={adminSharedStyles.screen} edges={["left", "right"]}>
      <ScreenHeader title="Guest Users" onBack={() => router.back()} />

      <FlatList
        data={guests}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={AdminTheme.accent}
          />
        }
        contentContainerStyle={adminSharedStyles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <LinearGradient colors={AdminTheme.gradientSoft} style={styles.hero}>
              <View style={styles.heroIcon}>
                <Feather name="users" size={sf(18)} color={AdminTheme.accent} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Community guests</Text>
                <Text style={styles.heroSubtitle}>
                  {stats.active ?? 0} active · {pendingTotal} pending review
                </Text>
              </View>
            </LinearGradient>

            <View style={styles.statsRow}>
              <StatChip label="Total" value={stats.total ?? guests.length} />
              <StatChip label="Active" value={stats.active ?? 0} tone="active" />
              <StatChip label="Pending" value={pendingTotal} tone="pending" />
            </View>

            <View style={adminSharedStyles.searchWrap}>
              <Feather name="search" size={sf(16)} color={AdminTheme.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={load}
                placeholder="Search name, phone, email, or code"
                placeholderTextColor={AdminTheme.textMuted}
                style={adminSharedStyles.searchInput}
                returnKeyType="search"
              />
              {search.length > 0 ? (
                <Pressable onPress={() => { setSearch(""); load(); }} hitSlop={8}>
                  <Feather name="x" size={sf(16)} color={AdminTheme.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={adminSharedStyles.filterRow}
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
                const count = filterCounts[item.key];
                return (
                  <Pressable
                    key={item.key}
                    style={[adminSharedStyles.filterChip, active && adminSharedStyles.filterChipActive]}
                    onPress={() => setFilter(item.key)}
                  >
                    <Text style={[adminSharedStyles.filterChipText, active && adminSharedStyles.filterChipTextActive]}>
                      {item.label}
                      {typeof count === "number" ? ` (${count})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Feather name="user-plus" size={sf(22)} color={AdminTheme.accent} />
            </View>
            <Text style={adminSharedStyles.emptyText}>{emptyMessage}</Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push("/screens/invite-guest-admin")}>
              <Feather name="plus" size={sf(14)} color="#FFF" />
              <Text style={styles.emptyCtaText}>Invite guest</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <GuestCard item={item} revoking={revokingId === item.id} onRevoke={handleRevoke} />
        )}
      />

      <Pressable style={styles.fab} onPress={() => router.push("/screens/invite-guest-admin")}>
        <Feather name="user-plus" size={sf(22)} color="#FFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBlock: { gap: sw(12), paddingBottom: sw(4) },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    borderRadius: sw(16),
    padding: sw(14),
    borderWidth: 1,
    borderColor: AdminTheme.accentBorder,
  },
  heroIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: AdminTheme.text,
  },
  heroSubtitle: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    gap: sw(8),
  },
  statChip: {
    flex: 1,
    borderRadius: sw(12),
    paddingVertical: sw(10),
    paddingHorizontal: sw(10),
    borderWidth: 1,
    alignItems: "center",
  },
  statValue: {
    fontFamily: Fonts.bold,
    fontSize: sf(16),
    lineHeight: sf(20),
  },
  statLabel: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: AdminTheme.surface,
    borderRadius: sw(16),
    padding: sw(14),
    marginBottom: sw(12),
    borderWidth: 1,
    borderColor: AdminTheme.border,
    borderLeftWidth: sw(4),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(12),
  },
  avatar: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(14),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: sw(4),
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: sw(4),
    maxWidth: "52%",
  },
  name: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    color: AdminTheme.text,
    lineHeight: sf(20),
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "46%",
  },
  statusPillText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    flexShrink: 1,
  },
  inviteTypePill: {
    paddingHorizontal: sw(8),
    paddingVertical: sw(4),
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  inviteTypePillAdmin: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  inviteTypePillText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(10),
    color: "#2563EB",
  },
  inviteTypePillTextAdmin: {
    color: "#7C3AED",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
  },
  metaText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textMuted,
  },
  infoBlock: {
    marginTop: sw(12),
    paddingTop: sw(12),
    borderTopWidth: 1,
    borderTopColor: AdminTheme.borderSubtle,
    gap: sw(10),
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(10),
  },
  infoIconWrap: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(8),
    backgroundColor: AdminTheme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontFamily: Fonts.medium,
    fontSize: sf(10),
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoValue: {
    marginTop: sw(2),
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    color: AdminTheme.textSecondary,
    lineHeight: sf(17),
  },
  codeValue: {
    marginTop: sw(2),
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    color: AdminTheme.accent,
    letterSpacing: 0.8,
  },
  cardFooter: {
    marginTop: sw(12),
    paddingTop: sw(10),
    borderTopWidth: 1,
    borderTopColor: AdminTheme.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sw(10),
  },
  footerMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    minWidth: 0,
  },
  footerMetaText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    color: "#94A3B8",
  },
  revokeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(4),
    paddingHorizontal: sw(12),
    paddingVertical: sw(8),
    borderRadius: sw(10),
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    minWidth: sw(88),
    justifyContent: "center",
  },
  revokeBtnDisabled: {
    opacity: 0.6,
  },
  revokeText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(12),
    color: "#DC2626",
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: sw(24),
    gap: sw(10),
  },
  emptyIcon: {
    width: sw(52),
    height: sw(52),
    borderRadius: sw(16),
    backgroundColor: AdminTheme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(4),
    paddingHorizontal: sw(14),
    paddingVertical: sw(10),
    borderRadius: 999,
    backgroundColor: AdminTheme.accent,
  },
  emptyCtaText: {
    fontFamily: Fonts.semibold,
    fontSize: sf(13),
    color: "#FFFFFF",
  },
  fab: {
    position: "absolute",
    right: sw(20),
    bottom: sw(24),
    width: sw(56),
    height: sw(56),
    borderRadius: sw(28),
    backgroundColor: AdminTheme.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: AdminTheme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
});
