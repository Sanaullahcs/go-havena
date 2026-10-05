import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import InternalScreenHeader from "../../../components/layout/internal-screen-header";
import LocaleTextInput from "../../../components/ui/locale-text-input";
import { Fonts } from "../../../constants/font";
import { HomeTheme as T } from "../../../constants/home-theme";
import { fetchMyResidentFeatures, requestFeatureDisable, requestFeatureEnable } from "../../../services/resident-features-api";
import { fetchMe } from "../../../services/auth-api";
import { subscribeSessionUser } from "../../../services/auth-session";
import { getApiErrorMessage } from "../../../utils/api-error-core";
import { sw, sf } from "../../../utils/responsive";

const REASON_ACCESSORY_ID = "adjust-feature-reason";

function groupCatalog(catalog) {
  const groups = [];
  const index = new Map();
  catalog.forEach((item) => {
    const existing = index.get(item.group);
    if (existing === undefined) {
      index.set(item.group, groups.length);
      groups.push({ label: item.group_label, features: [item] });
    } else {
      groups[existing].features.push(item);
    }
  });
  return groups;
}

export default function AdjustFeaturesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOpenRef = useRef(false);
  const submittingRef = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [values, setValues] = useState({});
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null);
  const [requestMode, setRequestMode] = useState("disable");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  submittingRef.current = submitting;

  const applyPayload = useCallback((payload) => {
    const nextCatalog = (payload?.catalog ?? []).filter((item) => {
      if (item.disabled_by === "system_admin") return false;
      if (item.disabled_by === "community_admin") return true;
      const enabled = payload?.features?.[item.key];
      return enabled !== false && item.enabled !== false;
    });
    setCatalog(nextCatalog);
    setValues(payload?.features ?? {});
    setPending(payload?.pending_requests ?? []);
  }, []);

  useEffect(() => subscribeSessionUser((user) => {
    if (user?.resident_features?.catalog) applyPayload(user.resident_features);
  }), [applyPayload]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      applyPayload(await fetchMyResidentFeatures());
      setError(null);
      try {
        await fetchMe();
      } catch {
        // The feature list is already current; session refresh can retry on the next poll.
      }
    } catch (err) {
      if (!silent) setError(getApiErrorMessage(err) || "Could not load features.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => {
      void load(true);
    }, 4000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [load]));

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardOpenRef.current = true;
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardOpenRef.current = false;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const closeModal = useCallback(() => {
    if (submitting) return;
    Keyboard.dismiss();
    setTarget(null);
  }, [submitting]);

  const onBackdrop = () => {
    if (keyboardOpenRef.current) {
      Keyboard.dismiss();
      return;
    }
    closeModal();
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < 28 || submittingRef.current) return;
      if (keyboardOpenRef.current) {
        Keyboard.dismiss();
        return;
      }
      Keyboard.dismiss();
      setTarget(null);
    },
  })).current;

  const pendingFor = (key) => pending.find((item) => item.feature_key === key && item.status === "pending");

  const onToggle = (feature, next) => {
    if (pendingFor(feature.key) || submitting) return;
    if (next) {
      if (feature.disabled_by !== "community_admin") return;
      setRequestMode("enable");
    } else {
      setRequestMode("disable");
    }
    setTarget(feature);
    setReason("");
  };

  const submit = async () => {
    const text = reason.trim();
    if (text.length < 3) {
      setError("Please provide a reason for this request.");
      return;
    }
    setSubmitting(true);
    try {
      const result = requestMode === "enable"
        ? await requestFeatureEnable(target.key, text)
        : await requestFeatureDisable(target.key, text);
      applyPayload(result?.features);
      await fetchMe();
      setTarget(null);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err) || "Could not send the request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <InternalScreenHeader
        title={t("settings.adjustFeatures", { defaultValue: "Adjust Features" })}
        subtitle={t("settings.adjustFeaturesHint", { defaultValue: "Turning a feature off or back on sends a request. It stays as it is until a system administrator approves it. Features turned off by a system administrator stay hidden." })}
      />
      {loading ? (
        <ActivityIndicator color={T.navy} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {groupCatalog(catalog).map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.features.map((feature) => {
                const enabled = values[feature.key] !== false;
                const request = pendingFor(feature.key);
                const canReenable = !enabled && feature.disabled_by === "community_admin";
                return (
                  <View key={feature.key} style={styles.row}>
                    <View style={styles.copy}>
                      <Text style={styles.title}>{feature.label}</Text>
                      <Text style={styles.desc}>{feature.description}</Text>
                      {request ? <Text style={styles.pending}>Pending approval</Text> : null}
                      {canReenable && !request ? <Text style={styles.off}>Off — request to turn this back on</Text> : null}
                    </View>
                    <Switch
                      value={enabled}
                      disabled={Boolean(request) || submitting || (!enabled && !canReenable)}
                      onValueChange={(next) => onToggle(feature, next)}
                      trackColor={{ false: "#CBD5E1", true: "#1B4F8A" }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                );
              })}
            </View>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(target)}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={keyboardHeight === 0}
        >
          <Pressable style={styles.backdrop} onPress={onBackdrop} />
          <View style={[styles.sheet, { marginBottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? sw(12) : Math.max(insets.bottom, sw(16)) }]}>
            <View style={styles.handleWrap} {...panResponder.panHandlers}>
              <View style={styles.handle} />
            </View>
            <Pressable onPress={Keyboard.dismiss}>
              <Text style={styles.modalTitle}>{requestMode === "enable" ? "Enable" : "Disable"} {target?.label}?</Text>
              <Text style={styles.modalBody}>
                Please provide a reason for this request. It stays {requestMode === "enable" ? "off" : "on"} until a system administrator approves it.
              </Text>
            </Pressable>
            <LocaleTextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason / Description"
              placeholderTextColor="#94A3B8"
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              inputAccessoryViewID={Platform.OS === "ios" ? REASON_ACCESSORY_ID : undefined}
              scrollEnabled
              style={[styles.input, keyboardHeight > 0 && styles.inputCompact]}
            />
            <View style={styles.actions}>
              <Pressable style={styles.cancel} onPress={closeModal} disabled={submitting}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submit, submitting && styles.submitDisabled]}
                onPress={submit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>Submit Request</Text>
                )}
              </Pressable>
            </View>
          </View>
          {Platform.OS === "ios" ? (
            <InputAccessoryView nativeID={REASON_ACCESSORY_ID}>
              <View style={styles.accessory}>
                <Pressable onPress={Keyboard.dismiss} hitSlop={10}>
                  <Text style={styles.accessoryDone}>Done</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: sw(18), paddingBottom: sw(40) },
  group: { marginBottom: sw(16) },
  groupLabel: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: sw(8),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: Fonts.semiBold, fontSize: sf(14), lineHeight: sf(20), color: "#101828" },
  desc: { marginTop: 2, fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(18), color: "#64748B" },
  pending: { marginTop: 6, fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#B45309" },
  off: { marginTop: 6, fontFamily: Fonts.semiBold, fontSize: sf(12), color: "#64748B" },
  error: { color: "#DC2626", fontFamily: Fonts.medium, marginTop: 8 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    zIndex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: sw(18),
    paddingTop: sw(8),
  },
  handleWrap: { alignItems: "center", paddingVertical: sw(8) },
  handle: { width: sw(40), height: 4, borderRadius: 2, backgroundColor: "#CBD5E1" },
  modalTitle: { fontFamily: Fonts.bold, fontSize: sf(18), lineHeight: sf(26), color: "#101828" },
  modalBody: { marginTop: 6, fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(20), color: "#64748B" },
  input: {
    marginTop: 14,
    height: 96,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    color: "#101828",
    textAlignVertical: "top",
  },
  inputCompact: { height: 72 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  cancel: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cancelText: { fontFamily: Fonts.semiBold, color: "#475569", fontSize: sf(14) },
  submit: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: T.navy,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: Fonts.semiBold, color: "#FFFFFF", fontSize: sf(14) },
  accessory: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  accessoryDone: { fontFamily: Fonts.semiBold, fontSize: sf(16), color: T.navy },
});
