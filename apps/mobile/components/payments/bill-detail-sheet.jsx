import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppModal from "../layout/app-modal";
import BillDocumentCard from "./bill-document-card";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { shareBillDocument } from "../../utils/share-bill-document";
import { rnShadow } from "../../utils/shadow";
import { sf, sw } from "../../utils/responsive";

const CARD_WIDTH = 360;

function ShareDocumentButton({ label, hint, onPress, busy }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.shareHit, pressed && !busy && styles.pressed, busy && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.shareFace, busy && styles.shareFaceBusy]}>
        {busy ? (
          <ActivityIndicator color={PropertyHubTheme.deepTeal} size="small" />
        ) : (
          <>
            <View style={styles.shareIconWell}>
              <Feather name="share-2" size={sf(18)} color={PropertyHubTheme.deepTeal} />
            </View>
            <View style={styles.shareCopy}>
              <Text style={styles.shareTitle} numberOfLines={1}>{label}</Text>
              {hint ? <Text style={styles.shareHint} numberOfLines={2}>{hint}</Text> : null}
            </View>
            <Feather name="download" size={sf(18)} color={PropertyHubTheme.textMuted} />
          </>
        )}
      </View>
    </Pressable>
  );
}

function FooterTextLink({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.footerLinkHit, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Text style={styles.footerLinkText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Bill details as a real invoice (unpaid) or receipt (paid), with the actions
 * that make sense for the bill's state.
 */
export default function BillDetailSheet({
  visible,
  doc,
  primaryLabel,
  onPrimary,
  primaryBusy = false,
  onClose,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);

  if (!doc) return null;

  const available = width - sw(32);
  const scale = Math.min(1, available / CARD_WIDTH);

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      await shareBillDocument(cardRef, doc, t);
    } finally {
      setSharing(false);
    }
  }

  function open(url) {
    if (url) Linking.openURL(url).catch(() => {});
  }

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("common.close")} />
        <View
          style={[
            styles.sheet,
            {
              height: Math.min(height * 0.94, height - insets.top - sw(8)),
              paddingBottom: Math.max(insets.bottom, sw(12)),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{doc.type === "receipt" ? t("bills.doc.receipt") : t("bills.doc.invoice")}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t("common.close")}>
              <Feather name="x" size={sf(18)} color={PropertyHubTheme.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={[styles.cardSlot, { width: CARD_WIDTH * scale, height: cardHeight ? cardHeight * scale : undefined }]}>
              <View
                style={{ width: CARD_WIDTH, transform: [{ scale }], transformOrigin: "top left" }}
                onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
              >
                <BillDocumentCard ref={cardRef} doc={doc} t={t} />
              </View>
            </View>

            {doc.paymentInstructions && doc.type === "invoice" ? (
              <View style={styles.note}>
                <Text style={styles.noteLabel}>{t("bills.doc.howToPay")}</Text>
                <Text style={styles.noteText}>{doc.paymentInstructions}</Text>
              </View>
            ) : null}
            {doc.description ? (
              <View style={styles.note}>
                <Text style={styles.noteLabel}>{t("bills.doc.details")}</Text>
                <Text style={styles.noteText}>{doc.description}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {primaryLabel && onPrimary ? (
              <Pressable
                onPress={onPrimary}
                disabled={primaryBusy}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed, primaryBusy && styles.disabled]}
                accessibilityRole="button"
              >
                {primaryBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
              </Pressable>
            ) : null}
            <ShareDocumentButton
              label={doc.type === "receipt" ? t("bills.doc.saveReceipt") : t("bills.doc.saveInvoice")}
              hint={t("bills.doc.shareHint")}
              onPress={() => void share()}
              busy={sharing}
            />
            {doc.proofUrl || doc.attachmentUrl ? (
              <View style={styles.footerLinks}>
                {doc.proofUrl ? <FooterTextLink label={t("bills.doc.viewProof")} onPress={() => open(doc.proofUrl)} /> : null}
                {doc.attachmentUrl ? <FooterTextLink label={t("bills.doc.attachedBill")} onPress={() => open(doc.attachmentUrl)} /> : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: "#EEF2F7",
    borderTopLeftRadius: sw(22),
    borderTopRightRadius: sw(22),
    overflow: "hidden",
    width: "100%",
  },
  scroll: { flex: 1 },
  handle: { alignSelf: "center", width: sw(40), height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginTop: sw(8) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sw(18),
    paddingTop: sw(8),
    paddingBottom: sw(4),
  },
  title: { fontFamily: Fonts.bold, fontSize: sf(17), color: PropertyHubTheme.text },
  close: { width: sw(32), height: sw(32), borderRadius: sw(16), alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  body: { alignItems: "center", paddingHorizontal: sw(16), paddingBottom: sw(8), gap: sw(10) },
  cardSlot: { alignSelf: "center", overflow: "visible" },
  note: { alignSelf: "stretch", backgroundColor: "#FFFFFF", borderRadius: sw(14), padding: sw(14) },
  noteLabel: { fontFamily: Fonts.semiBold, fontSize: sf(12), color: PropertyHubTheme.textMuted, marginBottom: sw(4) },
  noteText: { fontFamily: Fonts.regular, fontSize: sf(13), lineHeight: sf(19), color: PropertyHubTheme.text },
  footer: {
    paddingHorizontal: sw(16),
    paddingTop: sw(12),
    paddingBottom: sw(4),
    gap: sw(10),
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: -4 }, opacity: 0.06, radius: 12, elevation: 8 }),
  },
  primary: {
    minHeight: sw(48),
    borderRadius: sw(14),
    backgroundColor: PropertyHubTheme.teal,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: sw(14),
  },
  primaryText: { fontFamily: Fonts.bold, fontSize: sf(15), color: "#FFFFFF" },
  shareHit: { width: "100%", alignSelf: "stretch" },
  shareFace: {
    width: "100%",
    minHeight: sw(56),
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(12),
    borderRadius: sw(14),
    borderWidth: 1.5,
    borderColor: PropertyHubTheme.teal,
    backgroundColor: PropertyHubTheme.mint,
  },
  shareFaceBusy: { justifyContent: "center" },
  shareIconWell: {
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: PropertyHubTheme.iconBorder,
  },
  shareCopy: { flex: 1, minWidth: 0 },
  shareTitle: { fontFamily: Fonts.bold, fontSize: sf(14), color: PropertyHubTheme.deepTeal },
  shareHint: { fontFamily: Fonts.regular, fontSize: sf(12), lineHeight: sf(17), color: PropertyHubTheme.textMuted, marginTop: sw(2) },
  footerLinks: { alignItems: "center", gap: sw(6), paddingTop: sw(2), paddingBottom: sw(4) },
  footerLinkHit: { paddingVertical: sw(6), paddingHorizontal: sw(12) },
  footerLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(14),
    color: PropertyHubTheme.deepTeal,
    textAlign: "center",
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.55 },
});
