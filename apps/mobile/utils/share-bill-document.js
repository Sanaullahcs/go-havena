import { Share } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

function textVersion(doc, t) {
  const lines = [
    `${doc.type === "receipt" ? t("bills.doc.receipt") : t("bills.doc.invoice")} ${doc.number}`,
    `${doc.title} · ${doc.amountLabel}`,
    `${t("bills.doc.statusLabel")}: ${doc.status.label}`,
    doc.period ? `${t("bills.doc.period")}: ${doc.period}` : null,
    doc.billedTo ? `${t("bills.doc.billedTo")}: ${doc.billedTo}${doc.unitNumber ? ` (${doc.unitNumber})` : ""}` : null,
    doc.payTo ? `${t("bills.doc.payTo")}: ${doc.payTo}` : null,
    doc.type === "receipt"
      ? doc.paidOn ? `${t("bills.doc.paidOnLabel")}: ${doc.paidOn}` : null
      : doc.dueOn ? `${t("bills.doc.dueDate")}: ${doc.dueOn}` : null,
    doc.method ? `${t("bills.doc.method")}: ${doc.method}` : null,
    doc.reference ? `${t("bills.doc.reference")}: ${doc.reference}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Saves the invoice/receipt as a PNG and opens the system share sheet
 * (Save to Files / Photos, WhatsApp, email…). Falls back to plain text.
 */
export async function shareBillDocument(cardRef, doc, t) {
  try {
    const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile", width: 1080 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: doc.type === "receipt" ? t("bills.doc.shareReceipt") : t("bills.doc.shareInvoice"),
      });
      return;
    }
  } catch {
    // Fall back to text when the image cannot be produced.
  }

  try {
    await Share.share({ message: textVersion(doc, t) });
  } catch {
    // The share sheet reports its own errors.
  }
}
