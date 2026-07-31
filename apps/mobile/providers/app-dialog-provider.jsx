import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "../constants/font";
import AppModal from "../components/layout/app-modal";

const AppDialogContext = createContext(null);

const ICONS = {
  success: { name: "checkmark-circle", color: "#10B981", bg: "#ECFDF5" },
  error: { name: "close-circle", color: "#DC2626", bg: "#FEF2F2" },
  warning: { name: "alert-circle", color: "#D97706", bg: "#FFFBEB" },
  info: { name: "information-circle", color: "#0052DF", bg: "#EFF6FF" },
  confirm: { name: "help-circle", color: "#0052DF", bg: "#EFF6FF" },
};

function MetaRow({ label, value, tone = "default" }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text
        style={[
          styles.metaValue,
          tone === "danger" && styles.metaValueDanger,
          tone === "success" && styles.metaValueSuccess,
        ]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

function StatusDialogBody({ config, icon }) {
  const isDanger = config.type === "error";

  return (
    <>
      <View style={styles.statusHeader}>
        <View style={[styles.statusIconWrap, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={28} color={icon.color} />
        </View>
        <View style={styles.statusHeaderCopy}>
          {config.statusLabel ? (
            <View
              style={[
                styles.statusPill,
                isDanger ? styles.statusPillDanger : styles.statusPillWarning,
              ]}
            >
              <View
                style={[
                  styles.statusPillDot,
                  isDanger ? styles.statusPillDotDanger : styles.statusPillDotWarning,
                ]}
              />
              <Text
                style={[
                  styles.statusPillText,
                  isDanger ? styles.statusPillTextDanger : styles.statusPillTextWarning,
                ]}
              >
                {config.statusLabel}
              </Text>
            </View>
          ) : null}
          {config.title ? <Text style={styles.statusTitle}>{config.title}</Text> : null}
          {config.message ? <Text style={styles.statusMessage}>{config.message}</Text> : null}
        </View>
      </View>

      {config.meta?.length || config.highlight ? (
        <View style={[styles.detailsCard, isDanger && styles.detailsCardDanger]}>
          {config.meta?.map((row) => (
            <MetaRow
              key={row.label}
              label={row.label}
              value={row.value}
              tone={row.tone}
            />
          ))}

          {config.highlight ? (
            <View style={[styles.highlightBox, isDanger && styles.highlightBoxDanger]}>
              <Text style={[styles.highlightLabel, isDanger && styles.highlightLabelDanger]}>
                {config.highlight.label}
              </Text>
              <Text style={[styles.highlightValue, isDanger && styles.highlightValueDanger]}>
                {config.highlight.value}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {config.footerNote ? (
        <Text style={styles.footerNote}>{config.footerNote}</Text>
      ) : null}
    </>
  );
}

function AppDialogModal({ config, onClose }) {
  if (!config?.visible) return null;

  const icon = ICONS[config.type] ?? ICONS.info;
  const isStatusLayout = config.layout === "status";

  return (
    <AppModal visible={config?.visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, isStatusLayout && styles.sheetStatus]}>
          {isStatusLayout ? (
            <StatusDialogBody config={config} icon={icon} />
          ) : (
            <>
              <View style={[styles.iconRing, { backgroundColor: icon.bg }]}>
                <Ionicons name={icon.name} size={40} color={icon.color} />
              </View>

              {config.title ? <Text style={styles.title}>{config.title}</Text> : null}
              {config.message ? <Text style={styles.message}>{config.message}</Text> : null}
            </>
          )}

          <View style={[styles.actions, isStatusLayout && styles.actionsStatus]}>
            {(config.actions ?? []).map((action, index) => {
              const isPrimary =
                action.variant === "primary" ||
                (!action.variant && index === (config.actions?.length ?? 1) - 1);
              const isDestructive = action.variant === "destructive";
              const isSecondary = action.variant === "secondary";

              return (
                <TouchableOpacity
                  key={action.key ?? `${action.label}-${index}`}
                  style={[
                    styles.actionBtn,
                    isPrimary && styles.actionPrimary,
                    isSecondary && styles.actionSecondary,
                    isDestructive && styles.actionDestructive,
                    action.loading && styles.actionDisabled,
                  ]}
                  activeOpacity={0.85}
                  disabled={action.loading}
                  onPress={() => action.onPress?.()}
                >
                  {action.loading ? (
                    <ActivityIndicator
                      color={isPrimary || isDestructive ? "#FFFFFF" : "#0052DF"}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.actionText,
                        (isPrimary || isDestructive) && styles.actionTextLight,
                        isSecondary && styles.actionTextSecondary,
                      ]}
                    >
                      {action.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </AppModal>
  );
}

export function AppDialogProvider({ children }) {
  const [config, setConfig] = useState({ visible: false });
  const resolverRef = useRef(null);

  const closeDialog = useCallback((result) => {
    setConfig((current) => ({ ...current, visible: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const showDialog = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfig({
        visible: true,
        type: options.type ?? "info",
        layout: options.layout ?? "default",
        title: options.title ?? "",
        message: options.message ?? "",
        statusLabel: options.statusLabel ?? null,
        meta: options.meta ?? null,
        highlight: options.highlight ?? null,
        footerNote: options.footerNote ?? null,
        actions: (options.actions ?? [{ label: "OK", variant: "primary" }]).map((action) => ({
          ...action,
          onPress: () => {
            closeDialog(action.key ?? action.label);
            setTimeout(() => action.onPress?.(), 0);
          },
        })),
      });
    });
  }, [closeDialog]);

  const showSuccess = useCallback(
    (title, message, actions) =>
      showDialog({
        type: "success",
        title,
        message,
        actions: actions ?? [{ label: "Continue", variant: "primary" }],
      }),
    [showDialog],
  );

  const showError = useCallback(
    (title, message, actions) =>
      showDialog({
        type: "error",
        title,
        message,
        actions: actions ?? [{ label: "OK", variant: "primary" }],
      }),
    [showDialog],
  );

  const showConfirm = useCallback(
    (title, message, { confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false } = {}) =>
      showDialog({
        type: destructive ? "warning" : "confirm",
        title,
        message,
        actions: [
          { key: "cancel", label: cancelLabel, variant: "secondary" },
          { key: "confirm", label: confirmLabel, variant: destructive ? "destructive" : "primary" },
        ],
      }),
    [showDialog],
  );

  const value = useMemo(
    () => ({ showDialog, showSuccess, showError, showConfirm, closeDialog }),
    [showDialog, showSuccess, showError, showConfirm, closeDialog],
  );

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <AppDialogModal config={config} onClose={() => closeDialog("dismiss")} />
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  sheetStatus: {
    maxWidth: 360,
    alignItems: "stretch",
    padding: 20,
    borderRadius: 22,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
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
  statusHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },
  statusIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statusHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  statusPillWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  statusPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillDotDanger: {
    backgroundColor: "#DC2626",
  },
  statusPillDotWarning: {
    backgroundColor: "#D97706",
  },
  statusPillText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  statusPillTextDanger: {
    color: "#B91C1C",
  },
  statusPillTextWarning: {
    color: "#B45309",
  },
  statusTitle: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: "#101828",
  },
  statusMessage: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: "#667085",
  },
  detailsCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#FAFBFC",
    gap: 10,
    marginBottom: 4,
  },
  detailsCardDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFBFB",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  metaLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: "#667085",
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: "#344054",
  },
  metaValueDanger: {
    color: "#B91C1C",
  },
  metaValueSuccess: {
    color: "#047857",
  },
  highlightBox: {
    marginTop: 2,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  highlightBoxDanger: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FECACA",
  },
  highlightLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    color: "#667085",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  highlightLabelDanger: {
    color: "#B91C1C",
  },
  highlightValue: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: "#344054",
  },
  highlightValueDanger: {
    color: "#7F1D1D",
  },
  footerNote: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#98A2B3",
    textAlign: "center",
  },
  actions: {
    marginTop: 20,
    width: "100%",
    gap: 10,
  },
  actionsStatus: {
    marginTop: 16,
  },
  actionBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "#F3F4F6",
  },
  actionPrimary: {
    backgroundColor: "#0052DF",
  },
  actionSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionDestructive: {
    backgroundColor: "#DC2626",
  },
  actionDisabled: {
    opacity: 0.7,
  },
  actionText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: "#364153",
    fontWeight: "600",
  },
  actionTextLight: {
    color: "#FFFFFF",
  },
  actionTextSecondary: {
    color: "#344054",
  },
});
