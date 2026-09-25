import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { rnShadow } from "../../utils/shadow";
import { useAppDialog } from "../../providers/app-dialog-provider";
import { fetchAppVersionPolicy } from "../../services/app-version-api";
import {
  evaluateUpdateRequirement,
  getInstalledAppVersion,
  subscribeAppVersionCheck,
} from "../../services/app-version";

const FORCE_TITLE = "Update Required";
const FORCE_MESSAGE =
  "A new version of Havena is available. Please update the app to continue.";
const OPTIONAL_TITLE = "Update Available";
const OPTIONAL_MESSAGE =
  "A new version of Havena is available. Please update the app.";
const UPDATE_NOW = "Update Now";
const LATER = "Later";

export async function openAppStoreUrl(storeUrl) {
  if (!storeUrl) return;
  try {
    const can = await Linking.canOpenURL(storeUrl);
    if (can || Platform.OS === "android") {
      await Linking.openURL(storeUrl);
    }
  } catch {
    // ignore
  }
}

function ForceUpdateModal({ visible, storeUrl }) {
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.sheet}>
          <View style={styles.iconRing}>
            <Ionicons name="cloud-download-outline" size={36} color="#1B4F8A" />
          </View>
          <Text style={styles.title}>{FORCE_TITLE}</Text>
          <Text style={styles.message}>{FORCE_MESSAGE}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={() => openAppStoreUrl(storeUrl)}
          >
            <Text style={styles.primaryText}>{UPDATE_NOW}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AppUpdateGate() {
  const dialog = useAppDialog();
  const [forceVisible, setForceVisible] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const checkingRef = useRef(false);
  const optionalShownForRef = useRef(null);

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const [policy, installed] = await Promise.all([
        fetchAppVersionPolicy(),
        getInstalledAppVersion(),
      ]);
      if (!policy) return;

      const requirement = evaluateUpdateRequirement(policy, installed);
      setStoreUrl(policy.store_url || "");

      if (requirement === "force") {
        setForceVisible(true);
        return;
      }

      setForceVisible(false);

      if (requirement === "optional") {
        const key = `${installed}->${policy.latest_version}`;
        if (optionalShownForRef.current === key) return;
        optionalShownForRef.current = key;
        const result = await dialog.showDialog({
          type: "info",
          title: OPTIONAL_TITLE,
          message: OPTIONAL_MESSAGE,
          actions: [
            { key: "later", label: LATER, variant: "secondary" },
            {
              key: "update",
              label: UPDATE_NOW,
              variant: "primary",
              onPress: () => openAppStoreUrl(policy.store_url),
            },
          ],
        });
        if (result === "update") {
          // onPress already opens store; keep as safety
          await openAppStoreUrl(policy.store_url);
        }
      } else {
        optionalShownForRef.current = null;
      }
    } finally {
      checkingRef.current = false;
    }
  }, [dialog]);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runCheck();
      }
    });
    return () => sub.remove();
  }, [runCheck]);

  useEffect(() => subscribeAppVersionCheck(() => {
    optionalShownForRef.current = null;
    void runCheck();
  }), [runCheck]);

  return (
    <ForceUpdateModal
      visible={forceVisible}
      storeUrl={storeUrl}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 12 }, opacity: 0.16, radius: 24 }),
    elevation: 12,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#E8F1FB",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    lineHeight: 24,
    color: "#101828",
    textAlign: "center",
    fontWeight: "700",
  },
  message: {
    marginTop: 8,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: 20,
    minHeight: 48,
    width: "100%",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B4F8A",
    paddingHorizontal: 16,
  },
  primaryText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
