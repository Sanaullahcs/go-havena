import React, { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Platform, Switch, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { performSignOut } from "../../../services/sign-out";
import { fetchStaffInvitations } from "../../../services/complaints-api";
import { Feather } from "@expo/vector-icons";
import StaffScreenHeader from "../../../components/layout/staff-screen-header";
import StaffTabBar from "../../../components/layout/staff-tab-bar";
import { NAVY } from "../../../components/complaints/complaint-ui";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import { rnShadow } from "../../../utils/shadow";
import { fetchMe, updateProfile } from "../../../services/auth-api";
import { getCachedUser } from "../../../services/auth-session";
import { usePushNotificationSettings } from "../../../hooks/use-push-notification-settings";

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "S";
}

export default function StaffProfileScreen() {
  const router = useRouter();
  const cached = getCachedUser();
  const push = usePushNotificationSettings();
  const [user, setUser] = useState(cached);
  const [name, setName] = useState(cached?.profile?.display_name || cached?.name || "");
  const [phone, setPhone] = useState(cached?.phone || "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteCount, setInviteCount] = useState(0);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchMe();
      setUser(next);
      if (!editing) {
        setName(next?.profile?.display_name || next?.name || "");
        setPhone(next?.phone || "");
      }
    } catch {
      setUser(getCachedUser());
    }
    try {
      const invitations = await fetchStaffInvitations();
      setInviteCount((invitations ?? []).filter((item) => item.status === "pending").length);
    } catch {
      setInviteCount(0);
    }
  }, [editing]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 8000);
    return () => clearInterval(timer);
  }, [load]));

  const communities = user?.staff_access?.communities ?? [];
  const skills = [...new Set(communities.flatMap((item) => item.specializations || []))];
  const skillLabel = [...new Set(communities.map((item) => item.specialization_label).filter(Boolean))].join(", ");

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) {
      setMessage("Enter your name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await updateProfile({ name: nextName, ...(phone.trim() ? { phone: phone.trim() } : {}) });
      setEditing(false);
      setMessage("Profile saved.");
      await load();
    } catch (err) {
      setMessage(err?.message || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => setConfirmingSignOut(true);

  const confirmLogout = async () => {
    setSigningOut(true);
    try {
      await performSignOut();
    } finally {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  };

  const saved = message === "Profile saved.";
  const displayName = name || user?.name || "Staff";

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StaffScreenHeader title="My profile" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(displayName)}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.person} numberOfLines={1}>{displayName}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Staff</Text>
            </View>
          </View>
        </View>

        <Text style={styles.section}>Account</Text>
        <View style={styles.card}>
          <Info icon="briefcase" tint="#E8F1FA" label="Specialization" value={skillLabel || (skills.length ? skills.join(", ") : "Not set")} />
          <Info icon="phone" tint="#E5F6F3" label="Phone" value={user?.phone || "Not set"} />
          <Info icon="mail" tint="#F3E8F8" label="Email" value={user?.email || "Not set"} last />
        </View>

        <Text style={styles.section}>Communities</Text>
        <View style={styles.card}>
          {communities.length ? communities.map((item, index) => (
            <View key={item.id ?? item.name} style={[styles.community, index === communities.length - 1 && styles.rowLast]}>
              <View style={[styles.icon, { backgroundColor: "#E8F1FA" }]}>
                <Feather name="home" size={sf(14)} color={NAVY} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoValue}>{item.name}</Text>
                {item.staff_type ? <Text style={styles.infoLabel}>{item.staff_type}</Text> : null}
              </View>
            </View>
          )) : (
            <Text style={styles.empty}>No accepted communities</Text>
          )}
        </View>

        <Pressable onPress={() => router.push("/screens/staff-tasks/invitations")} style={styles.editRow} accessibilityRole="button" accessibilityLabel="Manage invitations">
          <View style={[styles.icon, { backgroundColor: "#E8F1FA" }]}>
            <Feather name="mail" size={sf(14)} color={NAVY} />
          </View>
          <Text style={styles.editText}>Manage Invitations</Text>
          {inviteCount > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{inviteCount > 9 ? "9+" : String(inviteCount)}</Text>
            </View>
          ) : null}
          <Feather name="chevron-right" size={sf(16)} color="#94A3B8" />
        </Pressable>
        <Pressable onPress={() => setEditing((open) => !open)} style={styles.editRow} accessibilityRole="button">
          <View style={[styles.icon, { backgroundColor: "#E8F1FA" }]}>
            <Feather name="edit-2" size={sf(14)} color={NAVY} />
          </View>
          <Text style={styles.editText}>{editing ? "Hide profile editor" : "Edit name and phone"}</Text>
          <Feather name={editing ? "chevron-up" : "chevron-right"} size={sf(16)} color="#94A3B8" />
        </Pressable>
        {editing ? (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="#94A3B8" style={styles.input} />
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor="#94A3B8" keyboardType="phone-pad" style={styles.input} />
            <Pressable disabled={busy} onPress={() => void save()} style={[styles.save, busy && styles.saveBusy]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        ) : null}
        {message ? (
          <View style={[styles.note, saved ? styles.noteOk : styles.noteError]}>
            <Feather name={saved ? "check-circle" : "alert-circle"} size={sf(14)} color={saved ? "#0F766E" : "#B91C1C"} />
            <Text style={[styles.noteText, { color: saved ? "#0F766E" : "#B91C1C" }]}>{message}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>Preferences</Text>
        <View style={styles.card}>
          <View style={styles.pref}>
            <View style={[styles.icon, { backgroundColor: "#E7F8EF" }]}>
              <Feather name="bell" size={sf(14)} color="#059669" />
            </View>
            <View style={styles.prefCopy}>
              <Text style={styles.prefTitle}>Push notifications</Text>
              <Text style={styles.prefHint}>Assignments, messages, and status updates.</Text>
            </View>
            <Switch
              value={Boolean(push.pushEnabled)}
              disabled={push.loading || push.pushBusy}
              onValueChange={(value) => { void push.setPush(value); }}
              trackColor={{ true: NAVY, false: "#CBD5E1" }}
            />
          </View>
        </View>

        <Pressable onPress={signOut} style={styles.signOut}>
          <Feather name="log-out" size={sf(16)} color="#E11D48" />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
      <StaffTabBar active="profile" />
      <Modal visible={confirmingSignOut} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!signingOut) setConfirmingSignOut(false); }}>
        <Pressable style={styles.logoutBackdrop} onPress={() => { if (!signingOut) setConfirmingSignOut(false); }}>
          <Pressable style={styles.logoutCard} onPress={() => {}}>
            <View style={styles.logoutIcon}>
              <Feather name="log-out" size={sf(18)} color="#E11D48" />
            </View>
            <Text style={styles.logoutTitle}>Log Out?</Text>
            <Text style={styles.logoutMessage}>Are you sure you want to log out of your account?</Text>
            <View style={styles.logoutActions}>
              <Pressable disabled={signingOut} onPress={() => setConfirmingSignOut(false)} style={styles.logoutCancel} accessibilityRole="button">
                <Text style={styles.logoutCancelText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={signingOut} onPress={() => void confirmLogout()} style={styles.logoutConfirm} accessibilityRole="button">
                <Text style={styles.logoutConfirmText}>{signingOut ? "Signing out…" : "Log Out"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Info({ icon, tint, label, value, last = false }) {
  return (
    <View style={[styles.info, last && styles.rowLast]}>
      <View style={[styles.icon, { backgroundColor: tint }]}>
        <Feather name={icon} size={sf(14)} color={NAVY} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const card = {
  backgroundColor: "#fff",
  borderRadius: sw(16),
  borderWidth: 1,
  borderColor: "#E6EDF5",
  ...rnShadow({ color: "#1B4F8A", offset: { width: 0, height: 2 }, opacity: 0.05, radius: 8 }),
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  body: { padding: sw(16), paddingBottom: sw(24), gap: sw(10) },
  identity: { ...card, flexDirection: "row", alignItems: "center", gap: sw(12), padding: sw(14) },
  avatar: { width: sw(56), height: sw(56), borderRadius: sw(28), backgroundColor: "#E8F1FA", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: Fonts.bold, fontSize: sf(20), color: NAVY },
  identityCopy: { flex: 1, minWidth: 0, gap: sw(6) },
  person: { fontFamily: Fonts.bold, fontSize: sf(18), color: "#0F172A" },
  badge: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#E8F1FA", paddingHorizontal: sw(8), paddingVertical: sw(3) },
  badgeText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: NAVY },
  section: { marginTop: sw(4), fontFamily: Fonts.semiBold, fontSize: sf(11), letterSpacing: 0.8, color: "#64748B" },
  card: { ...card, paddingHorizontal: sw(14), paddingVertical: sw(4) },
  info: { flexDirection: "row", alignItems: "center", gap: sw(10), paddingVertical: sw(10), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E7EEF6" },
  rowLast: { borderBottomWidth: 0 },
  icon: { width: sw(32), height: sw(32), borderRadius: sw(10), alignItems: "center", justifyContent: "center" },
  infoCopy: { flex: 1, minWidth: 0, gap: 1 },
  infoLabel: { fontFamily: Fonts.medium, fontSize: sf(11), color: "#94A3B8" },
  infoValue: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  community: { flexDirection: "row", alignItems: "center", gap: sw(10), paddingVertical: sw(10), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E7EEF6" },
  empty: { paddingVertical: sw(12), fontFamily: Fonts.medium, fontSize: sf(13), color: "#64748B" },
  editRow: { ...card, minHeight: sw(52), paddingHorizontal: sw(14), flexDirection: "row", alignItems: "center", gap: sw(10) },
  editText: { flex: 1, fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  countBadge: { minWidth: sw(20), height: sw(20), borderRadius: sw(10), paddingHorizontal: sw(5), backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  countBadgeText: { fontFamily: Fonts.bold, fontSize: sf(10), color: "#FFFFFF" },
  fieldLabel: { marginTop: sw(8), fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  input: { height: sw(44), marginTop: sw(4), borderRadius: sw(12), borderWidth: 1, borderColor: "#E6EDF5", paddingHorizontal: sw(12), fontFamily: Fonts.medium, fontSize: sf(14), color: "#0F172A", ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null) },
  save: { height: sw(42), marginTop: sw(12), marginBottom: sw(8), borderRadius: sw(12), backgroundColor: NAVY, alignItems: "center", justifyContent: "center" },
  saveBusy: { opacity: 0.7 },
  saveText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#fff" },
  note: { flexDirection: "row", alignItems: "center", gap: sw(8), borderRadius: sw(12), borderWidth: 1, paddingHorizontal: sw(12), paddingVertical: sw(10) },
  noteOk: { backgroundColor: "#F3FBF7", borderColor: "#D1FAE5" },
  noteError: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  noteText: { flex: 1, fontFamily: Fonts.medium, fontSize: sf(13) },
  pref: { flexDirection: "row", alignItems: "center", gap: sw(10), paddingVertical: sw(10) },
  prefCopy: { flex: 1 },
  prefTitle: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#0F172A" },
  prefHint: { fontFamily: Fonts.medium, fontSize: sf(12), color: "#64748B" },
  signOut: { height: sw(46), marginTop: sw(4), borderRadius: sw(14), backgroundColor: "#FDECEC", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sw(8) },
  signOutText: { fontFamily: Fonts.semiBold, fontSize: sf(14), color: "#E11D48" },
  logoutBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", alignItems: "center", justifyContent: "center", paddingHorizontal: sw(24) },
  logoutCard: { width: "100%", maxWidth: 360, backgroundColor: "#FFFFFF", borderRadius: 24, paddingHorizontal: sw(18), paddingTop: sw(20), paddingBottom: sw(16), alignItems: "center" },
  logoutIcon: { width: sw(48), height: sw(48), borderRadius: sw(24), backgroundColor: "#FDECEC", alignItems: "center", justifyContent: "center", marginBottom: sw(10) },
  logoutTitle: { fontFamily: Fonts.bold, fontSize: sf(20), color: "#0F172A" },
  logoutMessage: { marginTop: sw(6), textAlign: "center", fontFamily: Fonts.medium, fontSize: sf(14), lineHeight: sf(20), color: "#64748B" },
  logoutActions: { marginTop: sw(16), alignSelf: "stretch", flexDirection: "row", gap: sw(8) },
  logoutCancel: { flex: 1, minHeight: sw(46), borderRadius: sw(14), backgroundColor: "#E8F1FA", alignItems: "center", justifyContent: "center" },
  logoutCancelText: { fontFamily: Fonts.bold, fontSize: sf(14), color: NAVY },
  logoutConfirm: { flex: 1, minHeight: sw(46), borderRadius: sw(14), backgroundColor: "#E11D48", alignItems: "center", justifyContent: "center" },
  logoutConfirmText: { fontFamily: Fonts.bold, fontSize: sf(14), color: "#FFFFFF" },
});
