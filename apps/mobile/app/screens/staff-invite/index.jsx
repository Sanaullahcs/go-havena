import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import ScreenStatusBar from "../../../components/layout/screen-status-bar";
import { getTopInset } from "../../../components/layout/system-chrome";
import { STAFF_NAVY } from "../../../components/layout/staff-screen-header";
import { Fonts } from "../../../constants/font";
import { sw, sf } from "../../../utils/responsive";
import {
  acceptStaffInviteByToken,
  previewStaffInviteByToken,
} from "../../../services/complaints-api";
import { fetchMe } from "../../../services/auth-api";
import {
  clearSession,
  getToken,
  getUser,
  setPendingStaffInviteToken,
} from "../../../services/auth-session";
import {
  navigateAfterStaffInviteAccepted,
  Routes,
} from "../../../constants/onboarding-routes";
import { parseApiDate } from "../../../utils/parse-api-date";
import { useAppDialog } from "../../../providers/app-dialog-provider";

function formatWhen(value) {
  const date = parseApiDate(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function emailsMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export default function StaffInviteAcceptScreen() {
  const router = useRouter();
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const token = useMemo(
    () => String(params.token || params.staff_invite || "").trim(),
    [params.token, params.staff_invite],
  );

  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [accountMismatch, setAccountMismatch] = useState(false);
  const [sessionEmail, setSessionEmail] = useState("");
  const [doneMessage, setDoneMessage] = useState("");

  const loadPreview = useCallback(async (inviteToken, user) => {
    setLoading(true);
    setError("");
    setAccountMismatch(false);
    try {
      const data = await previewStaffInviteByToken(inviteToken);
      setPreview(data);
      const email = user?.email || "";
      setSessionEmail(email);
      if (email && data?.email && !emailsMatch(email, data.email)) {
        setAccountMismatch(true);
        setError(
          `This invitation was sent to ${data.email}. You’re signed in as ${email}. Sign out and use the invited account to accept.`,
        );
      } else if (data && !data.can_accept) {
        setError(
          data.status === "expired"
            ? "This invitation has expired. Ask your community admin to send a new one."
            : "This staff invitation is no longer active.",
        );
      }
    } catch (err) {
      setPreview(null);
      setError(err?.message || "This invitation is no longer valid.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        if (!cancelled) {
          setError("This invitation link is missing or incomplete.");
          setBooting(false);
        }
        return;
      }

      await setPendingStaffInviteToken(token);
      const authToken = await getToken();
      if (!authToken) {
        if (!cancelled) {
          setBooting(false);
          router.replace(Routes.LOGIN);
        }
        return;
      }

      let user = await getUser();
      try {
        user = await fetchMe();
      } catch {
        // cached user is enough for email match checks
      }
      if (cancelled) return;
      setBooting(false);
      await loadPreview(token, user);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router, loadPreview]);

  const onAcceptPress = async () => {
    if (!token || accepting || accountMismatch || !preview?.can_accept) return;

    const communityLabel = String(preview.community_name || "").trim() || "this community";
    const result = await dialog.showConfirm(
      "Accept Staff Invitation?",
      `Are you sure you want to join ${communityLabel} as a staff member?`,
      { confirmLabel: "Accept", cancelLabel: "Cancel" },
    );
    if (result !== "confirm") return;

    setAccepting(true);
    setError("");
    try {
      const response = await acceptStaffInviteByToken(token);
      await setPendingStaffInviteToken("");
      const user = await fetchMe();
      setDoneMessage(response?.message || "Staff access is active.");
      navigateAfterStaffInviteAccepted(router, user);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 403) {
        setAccountMismatch(true);
      }
      setError(err?.message || "Could not accept this invitation.");
    } finally {
      setAccepting(false);
    }
  };

  const goSignIn = () => {
    void (async () => {
      await setPendingStaffInviteToken(token);
      await clearSession({ keepBiometricUnlock: false });
      router.replace(Routes.LOGIN);
    })();
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={[styles.header, { paddingTop: getTopInset(insets) + sw(8) }]}>
          <ScreenStatusBar style="light" androidBackgroundColor={STAFF_NAVY} />
          <Text style={styles.eyebrow}>Staff access</Text>
          <Text style={styles.title}>Accept Your Staff Invitation</Text>
        </View>
        <ActivityIndicator color={STAFF_NAVY} style={{ marginTop: sw(40) }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={[styles.header, { paddingTop: getTopInset(insets) + sw(8) }]}>
        <ScreenStatusBar style="light" androidBackgroundColor={STAFF_NAVY} />
        <Text style={styles.eyebrow}>Staff access</Text>
        <Text style={styles.title}>Accept Your Staff Invitation</Text>
        <Text style={styles.subtitle}>Confirm with the account that received this invite.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={STAFF_NAVY} style={{ marginTop: sw(12) }} /> : null}

        {error ? (
          <View style={[styles.banner, accountMismatch ? styles.bannerWarn : styles.bannerError]}>
            <Feather
              name={accountMismatch ? "user-x" : "alert-circle"}
              size={sf(16)}
              color={accountMismatch ? "#B45309" : "#B91C1C"}
            />
            <Text style={[styles.bannerText, { color: accountMismatch ? "#92400E" : "#B91C1C" }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {doneMessage ? (
          <View style={[styles.banner, styles.bannerOk]}>
            <Feather name="check-circle" size={sf(16)} color="#0F766E" />
            <Text style={[styles.bannerText, { color: "#0F766E" }]}>{doneMessage}</Text>
          </View>
        ) : null}

        {preview ? (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Feather name="briefcase" size={sf(18)} color={STAFF_NAVY} />
            </View>
            <Text style={styles.cardKicker}>COMMUNITY</Text>
            <Text style={styles.cardTitle}>{preview.community_name || "Your community"}</Text>
            <Text style={styles.cardMeta}>Invited as {preview.email}</Text>
            {preview.expires_at ? (
              <Text style={styles.cardDate}>Expires {formatWhen(preview.expires_at)}</Text>
            ) : null}
            {sessionEmail ? (
              <Text style={styles.cardSession}>Signed in as {sessionEmail}</Text>
            ) : null}
          </View>
        ) : null}

        {accountMismatch ? (
          <Pressable onPress={goSignIn} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Sign in with the invited account</Text>
          </Pressable>
        ) : null}

        {!accountMismatch && preview?.can_accept && !doneMessage ? (
          <Pressable
            disabled={accepting || loading}
            onPress={() => void onAcceptPress()}
            style={[styles.primaryBtn, accepting && styles.btnBusy]}
            accessibilityRole="button"
            accessibilityLabel="Accept staff invitation"
          >
            <Text style={styles.primaryBtnText}>
              {accepting ? "Accepting…" : "Accept invitation"}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.info}>
          <Feather name="shield" size={sf(14)} color={STAFF_NAVY} />
          <Text style={styles.infoText}>
            Acceptance activates staff access only for the invited account. Resident dashboard sessions on
            the web never auto-accept this link.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  header: {
    backgroundColor: STAFF_NAVY,
    paddingHorizontal: sw(16),
    paddingBottom: sw(16),
    borderBottomLeftRadius: sw(20),
    borderBottomRightRadius: sw(20),
  },
  eyebrow: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(11),
    letterSpacing: 1.1,
    color: "rgba(255,255,255,0.72)",
    textTransform: "uppercase",
  },
  title: {
    marginTop: sw(4),
    fontFamily: Fonts.bold,
    fontSize: sf(24),
    lineHeight: sf(28),
    color: "#FFFFFF",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  subtitle: {
    marginTop: sw(4),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "rgba(255,255,255,0.8)",
  },
  body: {
    paddingHorizontal: sw(16),
    paddingTop: sw(18),
    paddingBottom: sw(32),
    gap: sw(14),
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    borderRadius: sw(12),
    borderWidth: 1,
    paddingHorizontal: sw(12),
    paddingVertical: sw(10),
  },
  bannerOk: { backgroundColor: "#F3FBF7", borderColor: "#D1FAE5" },
  bannerError: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  bannerWarn: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  bannerText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    lineHeight: sf(18),
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(16),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    padding: sw(16),
    gap: sw(4),
  },
  cardIcon: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "#E8F0F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(6),
  },
  cardKicker: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    letterSpacing: 0.7,
    color: "#94A3B8",
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    color: "#0F172A",
  },
  cardMeta: {
    marginTop: sw(2),
    fontFamily: Fonts.medium,
    fontSize: sf(13),
    color: "#64748B",
  },
  cardDate: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#94A3B8",
  },
  cardSession: {
    marginTop: sw(8),
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#1B4F8A",
  },
  primaryBtn: {
    minHeight: sw(48),
    borderRadius: sw(14),
    backgroundColor: STAFF_NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtn: {
    minHeight: sw(48),
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#1B4F8A",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: STAFF_NAVY,
  },
  btnBusy: { opacity: 0.7 },
  primaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: "#FFFFFF",
  },
  info: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sw(8),
    backgroundColor: "#F7FAFD",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E6EDF5",
    padding: sw(12),
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(17),
    color: "#64748B",
  },
});
