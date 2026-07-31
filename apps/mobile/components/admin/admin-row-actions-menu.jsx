import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppModal from "../layout/app-modal";
import { Fonts } from "../../constants/font";
import { Colors, Layout } from "../../constants/tokens";
import { sf, sw } from "../../utils/responsive";

/**
 * @typedef {Object} AdminRowAction
 * @property {string} [id]
 * @property {string} label
 * @property {keyof typeof Ionicons.glyphMap} [icon]
 * @property {"default" | "primary" | "success" | "danger"} [tone]
 * @property {() => void | Promise<void>} onPress
 * @property {boolean} [disabled]
 * @property {boolean} [hidden]
 */

const TONE_COLOR = {
  default: Colors.brandPrimaryDeep,
  primary: Colors.brandPrimaryDeep,
  success: "#059669",
  danger: "#DC2626",
};

/**
 * @param {{
 *   actions: AdminRowAction[];
 *   disabled?: boolean;
 *   compact?: boolean;
 *   title?: string;
 *   message?: string;
 *   headerIcon?: keyof typeof Ionicons.glyphMap;
 * }} props
 */
export default function AdminRowActionsMenu({
  actions,
  disabled = false,
  compact = false,
  title = "Options",
  message,
  headerIcon = "options-outline",
}) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const visible = useMemo(
    () => (actions ?? []).filter((action) => !action.hidden),
    [actions],
  );

  if (visible.length === 0) return null;

  const runAction = async (action) => {
    if (disabled || action.disabled || busyId) return;
    const key = action.id ?? action.label;
    setBusyId(key);
    setOpen(false);
    try {
      await action.onPress();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.triggerCompact]}
        disabled={disabled}
        accessibilityLabel="Post options"
        onPress={() => setOpen(true)}
      >
        <Ionicons
          name={compact ? "ellipsis-horizontal" : "ellipsis-vertical"}
          size={sf(compact ? 20 : 18)}
          color="#64748B"
        />
      </TouchableOpacity>

      <AppModal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View pointerEvents="box-none" style={styles.overlayContent}>
            <View pointerEvents="auto" style={styles.card}>
              <View style={styles.iconRing}>
                <Ionicons name={headerIcon} size={sf(32)} color={Colors.brandPrimaryDeep} />
              </View>

              <Text style={styles.title}>{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}

              <View style={styles.actions}>
                {visible.map((action) => {
                  const tone = action.tone ?? "default";
                  const key = action.id ?? action.label;
                  const isBusy = busyId === key;
                  const isDanger = tone === "danger";

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.optionBtn, isDanger && styles.optionBtnDanger]}
                      activeOpacity={0.88}
                      disabled={disabled || action.disabled || Boolean(busyId)}
                      onPress={() => void runAction(action)}
                    >
                      {action.icon ? (
                        <Ionicons
                          name={action.icon}
                          size={sf(18)}
                          color={TONE_COLOR[tone]}
                        />
                      ) : null}
                      <Text style={[styles.optionBtnText, isDanger && styles.optionBtnTextDanger]}>
                        {action.label}
                      </Text>
                      {isBusy ? <ActivityIndicator size="small" color={TONE_COLOR[tone]} /> : null}
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={styles.cancelBtn}
                  activeOpacity={0.88}
                  onPress={() => setOpen(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Pressable>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: sf(36),
    height: sf(36),
    borderRadius: sf(10),
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  triggerCompact: {
    width: sf(32),
    height: sf(32),
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  overlayContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: sw(24),
  },
  card: {
    width: "100%",
    maxWidth: sw(340),
    backgroundColor: Colors.surface,
    borderRadius: sw(20),
    paddingHorizontal: sw(24),
    paddingTop: sw(24),
    paddingBottom: sw(20),
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  iconRing: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sw(16),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(18),
    lineHeight: sf(24),
    color: Colors.textPrimary,
    textAlign: "center",
    fontWeight: "700",
  },
  message: {
    marginTop: sw(8),
    fontFamily: Fonts.regular,
    fontSize: sf(14),
    lineHeight: sf(20),
    color: Colors.textSecondary,
    textAlign: "center",
  },
  actions: {
    marginTop: sw(20),
    width: "100%",
    gap: sw(10),
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sw(8),
    minHeight: sw(48),
    borderRadius: Layout.buttonRadius,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "rgba(0, 82, 223, 0.18)",
    paddingHorizontal: sw(16),
  },
  optionBtnDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "rgba(220, 38, 38, 0.18)",
  },
  optionBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: Colors.brandPrimaryDeep,
    fontWeight: "600",
  },
  optionBtnTextDanger: {
    color: "#DC2626",
  },
  cancelBtn: {
    minHeight: sw(48),
    borderRadius: Layout.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: sw(16),
  },
  cancelBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(15),
    color: Colors.textSecondary,
    fontWeight: "600",
  },
});
