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
import i18n from "../i18n";
import { rnShadow } from "../utils/shadow";


const AppDialogContext = createContext(null);

const ICONS = {
  success: { name: "checkmark-circle", color: "#10B981", bg: "#ECFDF5" },
  error: { name: "close-circle", color: "#DC2626", bg: "#FEF2F2" },
  warning: { name: "alert-circle", color: "#D97706", bg: "#FFFBEB" },
  info: { name: "information-circle", color: "#1B4F8A", bg: "#D1FAF5" },
  confirm: { name: "help-circle", color: "#1B4F8A", bg: "#D1FAF5" },
  marketplace: { name: "storefront-outline", color: "#1B4F8A", bg: "#D1FAF5" },
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

function PromptDialogBody({ config, icon }) {
  return (
    <>
      <View style={styles.promptHero}>
        <View style={[styles.promptIconHero, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={30} color={icon.color} />
        </View>
        {config.title ? <Text style={styles.promptTitleCentered}>{config.title}</Text> : null}
        {config.message ? (
          <Text style={styles.promptMessageCentered}>{config.message}</Text>
        ) : null}
      </View>

      {config.highlights?.length ? (
        <View style={styles.promptFlow}>
          {config.highlights.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
              {index > 0 ? (
                <View style={styles.promptFlowConnector}>
                  <View style={styles.promptFlowLine} />
                </View>
              ) : null}
              <View style={styles.promptFlowItem}>
                <View style={[styles.promptFlowIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={17} color={item.color} />
                </View>
                <Text style={styles.promptFlowLabel} numberOfLines={2}>
                  {item.label}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </>
  );
}

function AppDialogModal({ config, onClose }) {
  if (!config?.visible) return null;

  const icon = ICONS[config.type] ?? ICONS.info;
  const isStatusLayout = config.layout === "status";
  const isPromptLayout = config.layout === "prompt";
  const isCompact = config.layout === "compact";
  const actions = config.actions ?? [];
  // Two-action confirms (e.g. Cancel | Log Out) sit side-by-side without truncating labels.
  const isInlineActions = !isStatusLayout && !isPromptLayout && actions.length === 2;

  return (
    <AppModal visible={config?.visible} onRequestClose={onClose}>
      <View style={styles.overlay} collapsable={false}>
        <View
          style={[
            styles.sheet,
            isCompact && styles.sheetCompact,
            isStatusLayout && styles.sheetStatus,
            isPromptLayout && styles.sheetPrompt,
          ]}
          collapsable={false}
        >
          {isStatusLayout ? (
            <StatusDialogBody config={config} icon={icon} />
          ) : isPromptLayout ? (
            <PromptDialogBody config={config} icon={icon} />
          ) : (
            <>
              <View style={[styles.iconRing, isCompact && styles.iconRingCompact, { backgroundColor: icon.bg }]}>
                <Ionicons name={icon.name} size={isCompact ? 22 : 40} color={icon.color} />
              </View>

              {config.title ? <Text style={[styles.title, isCompact && styles.titleCompact]}>{config.title}</Text> : null}
              {config.message ? <Text style={[styles.message, isCompact && styles.messageCompact]}>{config.message}</Text> : null}
            </>
          )}

          <View
            style={[
              styles.actions,
              isInlineActions && styles.actionsInline,
              isCompact && styles.actionsCompact,
              isStatusLayout && styles.actionsStatus,
              isPromptLayout && styles.actionsPrompt,
            ]}
          >
            {actions.map((action, index) => {
              const isPrimary =
                action.variant === "primary" ||
                (!action.variant && index === actions.length - 1);
              const isDestructive = action.variant === "destructive";
              const isSecondary = action.variant === "secondary";
              const useTealPrimary = isPrimary && isPromptLayout;
              const usePromptGhostCancel = isSecondary && isPromptLayout;

              return (
                <TouchableOpacity
                  key={action.key ?? `${action.label}-${index}`}
                  style={[
                    styles.actionBtn,
                    isCompact && styles.actionBtnCompact,
                    isInlineActions && styles.actionBtnInline,
                    isPrimary && styles.actionPrimary,
                    useTealPrimary && styles.actionPrimaryPrompt,
                    isSecondary && !usePromptGhostCancel && styles.actionSecondary,
                    usePromptGhostCancel && styles.actionPromptGhost,
                    isDestructive && styles.actionDestructive,
                    action.loading && styles.actionDisabled,
                  ]}
                  activeOpacity={usePromptGhostCancel ? 0.6 : 0.85}
                  disabled={action.loading}
                  onPress={() => action.onPress?.()}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  {action.loading ? (
                    <ActivityIndicator
                      color={isPrimary || isDestructive ? "#FFFFFF" : "#1B4F8A"}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.actionText,
                        isInlineActions && styles.actionTextInline,
                        (isPrimary || isDestructive) && styles.actionTextLight,
                        isSecondary && !usePromptGhostCancel && styles.actionTextSecondary,
                        usePromptGhostCancel && styles.actionTextGhost,
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
        bullets: options.bullets ?? null,
        highlights: options.highlights ?? null,
        footerNote: options.footerNote ?? null,
        actions: (options.actions ?? [{ label: i18n.t("common.ok"), variant: "primary" }]).map((action) => ({
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
        actions: actions ?? [{ label: i18n.t("common.continue"), variant: "primary" }],
      }),
    [showDialog],
  );

  const showError = useCallback(
    (title, message, actions) =>
      showDialog({
        type: "error",
        title,
        message,
        actions: actions ?? [{ label: i18n.t("common.ok"), variant: "primary" }],
      }),
    [showDialog],
  );

  const showConfirm = useCallback(
    (title, message, { confirmLabel = i18n.t("common.confirm"), cancelLabel = i18n.t("common.cancel"), destructive = false } = {}) =>
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
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 12 }, opacity: 0.12, radius: 24 }),
    elevation: 8,
  },
  sheetCompact: {
    maxWidth: 248,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: 16,
  },
  iconRingCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageCompact: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  actionsCompact: {
    marginTop: 12,
  },
  actionBtnCompact: {
    minHeight: 34,
    borderRadius: 10,
    paddingVertical: 6,
  },
  sheetStatus: {
    maxWidth: 360,
    alignItems: "stretch",
    padding: 20,
    borderRadius: 22,
  },
  sheetPrompt: {
    maxWidth: 320,
    alignItems: "stretch",
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 18,
    borderRadius: 24,
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
  promptHero: {
    alignItems: "center",
    gap: 10,
    marginBottom: 22,
  },
  promptIconHero: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.16)",
    marginBottom: 2,
  },
  promptTitleCentered: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: "#0F172A",
    textAlign: "center",
  },
  promptMessageCentered: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 260,
  },
  promptFlow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 4,
  },
  promptFlowItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  promptFlowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  promptFlowLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    color: "#475569",
    textAlign: "center",
  },
  promptFlowConnector: {
    width: 18,
    alignItems: "center",
    paddingTop: 12,
  },
  promptFlowLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#E2E8F0",
  },
  actions: {
    marginTop: 20,
    width: "100%",
    gap: 10,
  },
  actionsInline: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
  },
  actionsStatus: {
    marginTop: 16,
  },
  actionsPrompt: {
    marginTop: 22,
    gap: 6,
  },
  actionPromptGhost: {
    backgroundColor: "transparent",
    borderWidth: 0,
    minHeight: 40,
  },
  actionTextGhost: {
    color: "#94A3B8",
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  actionBtn: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F3F4F6",
    width: "100%",
  },
  actionBtnInline: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    width: "auto",
    maxWidth: "100%",
    minWidth: 0,
    paddingHorizontal: 12,
  },
  actionPrimary: {
    backgroundColor: "#1B4F8A",
  },
  actionPrimaryPrompt: {
    backgroundColor: "#14B8A6",
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
    lineHeight: 20,
    color: "#364153",
    fontWeight: "600",
    textAlign: "center",
    textAlignVertical: "center",
  },
  actionTextInline: {
    textAlign: "center",
  },
  actionTextLight: {
    color: "#FFFFFF",
  },
  actionTextSecondary: {
    color: "#344054",
  },
});
