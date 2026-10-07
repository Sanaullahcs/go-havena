export const PAYMENT_REJECTION_CODES = [
  "unclear_proof",
  "amount_mismatch",
  "incorrect_bill",
  "invalid_receipt",
  "other",
];

export const PAYMENT_REJECTION_LABEL_KEYS = {
  unclear_proof: "services.paymentRejectUnclear",
  amount_mismatch: "services.paymentRejectAmountMismatch",
  incorrect_bill: "services.paymentRejectIncorrectBill",
  invalid_receipt: "services.paymentRejectInvalidReceipt",
  other: "services.paymentRejectOther",
};

export function validatePaymentRejection(rejectionCode, rejectionReason) {
  const code = String(rejectionCode ?? "").trim();
  if (!code) {
    return { rejection_code: "required" };
  }
  if (code === "other" && !String(rejectionReason ?? "").trim()) {
    return { rejection_reason: "required" };
  }
  return null;
}

/** Payload for amenity/service payment reject PATCH endpoints. */
export function buildPaymentRejectionBody(rejectionCode, rejectionReason) {
  const rejection_code = String(rejectionCode ?? "").trim();
  const body = { rejection_code };
  if (rejection_code === "other") {
    body.rejection_reason = String(rejectionReason ?? "").trim();
  }
  return body;
}

export function isRejectedBillStatus(status) {
  return String(status ?? "").toLowerCase() === "rejected";
}

export function normalizeRejectedBillRow(row) {
  if (!row || typeof row !== "object") return row;
  const residentBillId = row.resident_bill_id ?? row.id;
  return {
    ...row,
    id: row.id ?? residentBillId,
    resident_bill_id: residentBillId,
    status: row.status ?? (row.rejection_reason ? "rejected" : row.status),
  };
}

export function paymentBillKey(bill) {
  return Number(bill?.resident_bill_id ?? bill?.id ?? 0);
}

export function mergeBillRow(prev, updated) {
  const row = normalizeRejectedBillRow(updated);
  if (!row) return prev;
  const targetId = Number(row.resident_bill_id ?? row.id);
  return prev.map((item) => (
    Number(item.resident_bill_id ?? item.id) === targetId ? { ...item, ...row } : item
  ));
}
