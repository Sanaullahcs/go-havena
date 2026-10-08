import { formatCommunityMoney } from "./money";
import { getProfileFields } from "./profile-display";

/** Resident-facing groups used by the bill filters. */
export const BILL_GROUPS = ["due", "review", "paid"];

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatBillDate(value) {
  const date = dateOnly(value);
  return date ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
}

/** "8 Oct 2026, 3:15 PM" when the value has a clock, otherwise the date only. */
export function formatBillStamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const hasClock = /(?:T|\s)\d{2}:\d{2}/.test(raw);
  if (!hasClock) return formatBillDate(raw);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return formatBillDate(raw);
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** When this bill happened: paid or submitted time, or the due date. */
export function billListStamp(bill, status) {
  if (!status) return null;
  if (status.group === "paid" || status.group === "review") {
    return formatBillStamp(
      bill?.paid_at
      || bill?.approved_at
      || bill?.payment_acknowledgement?.approved_at
      || bill?.payment_proof?.submitted_at
      || bill?.payment_acknowledgement?.payment_date
      || bill?.payment_proof?.payment_date,
    );
  }
  return formatBillDate(bill?.due_date);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Pool Upkeep — October 2026" → "Pool Upkeep" when the period is already shown separately. */
function stripTrailingLabel(title, label) {
  const text = String(title || "").trim();
  const suffix = String(label || "").trim();
  if (!text || !suffix) return text;
  const separated = text.replace(new RegExp(`\\s*[\\u2014\\u2013\\-|·•]\\s*${escapeRegExp(suffix)}\\s*$`, "i"), "").trim();
  if (separated && separated !== text) return separated;
  if (text.toLowerCase().endsWith(suffix.toLowerCase())) {
    const cut = text.slice(0, text.length - suffix.length).replace(/[\s\u2014\u2013\-|·•]+$/u, "").trim();
    if (cut) return cut;
  }
  return text;
}

/** "2026-10" or "October 2026" → "Oct 2026". A bare year stays a year. */
export function shortBillPeriod(iso, label) {
  const key = String(iso || "");
  if (/^\d{4}-\d{2}/.test(key)) {
    const date = dateOnly(`${key.slice(0, 7)}-01`);
    if (date) return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  const text = String(label || "").trim();
  if (/^\d{4}$/.test(text)) return text;
  const parsed = text ? new Date(`${text.replace(/,/g, "")} 1`) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return text || null;
}

/**
 * First-screen copy for an amenity or unit bill.
 * The period is shown once, and the place is omitted when it repeats the title.
 */
export function billListFields(bill, kind) {
  const service = kind === "unit" ? bill?.service_name : bill?.amenity_name;
  const periodLabel = kind === "unit" ? bill?.billing_period_label : bill?.billing_month_label;
  const periodKey = kind === "unit" ? bill?.billing_period : bill?.billing_month;
  const raw = String((kind === "unit" ? bill?.title || service : bill?.title || service) || "").trim();
  const title = stripTrailingLabel(raw, periodLabel) || String(service || raw).trim();
  const serviceName = String(service || "").trim();
  const alreadyNamed = serviceName && new RegExp(`^${escapeRegExp(serviceName)}(?:\\s*[\\u2014\\u2013\\-|·•]|$)`, "i").test(title);
  const place = serviceName && !alreadyNamed ? serviceName : null;
  const period = shortBillPeriod(periodKey, periodLabel);
  return {
    title,
    subtitle: [place, period].filter(Boolean).join(" · "),
  };
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

export function billAmount(bill) {
  const value = Number(bill?.amount ?? bill?.resident_amount ?? bill?.amount_per_resident ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function hasProcessingPayment(bill) {
  return bill?.online_payment?.active_payment?.status === "processing";
}

/**
 * One status vocabulary for amenity and unit bills. "acknowledged" unit bills are
 * still unpaid; only "paid" is green.
 */
export function billStatusMeta(bill, t) {
  const key = String(bill?.status ?? "").toLowerCase();
  if (key === "paid") {
    return { key, group: "paid", tone: "success", label: t("bills.status.paid") };
  }
  if (hasProcessingPayment(bill)) {
    return { key: "processing", group: "review", tone: "info", label: t("bills.status.processing") };
  }
  if (key === "pending_verification") {
    return { key, group: "review", tone: "info", label: t("bills.status.inReview") };
  }
  if (key === "rejected") {
    return { key, group: "due", tone: "danger", label: t("bills.status.rejected") };
  }
  const due = dateOnly(bill?.due_date);
  if (key === "overdue" || (due && due < startOfToday())) {
    return { key: "overdue", group: "due", tone: "danger", label: t("bills.status.overdue") };
  }
  return { key: "unpaid", group: "due", tone: "warning", label: t("bills.status.unpaid") };
}

export function canPayBill(bill) {
  const meta = String(bill?.status ?? "").toLowerCase();
  if (hasProcessingPayment(bill)) return false;
  if (bill?.can_submit_proof === true) return true;
  return ["unpaid", "overdue", "rejected", "acknowledged"].includes(meta);
}

/** Overdue first, then unpaid by due date, then in review, then paid newest first. */
export function sortBills(bills, t) {
  const rank = { overdue: 0, rejected: 1, unpaid: 2, processing: 3, pending_verification: 4, paid: 5 };
  return [...bills].sort((a, b) => {
    const ra = rank[billStatusMeta(a, t).key] ?? 9;
    const rb = rank[billStatusMeta(b, t).key] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = dateOnly(a.due_date)?.getTime() ?? 0;
    const db = dateOnly(b.due_date)?.getTime() ?? 0;
    return ra === rank.paid ? db - da : da - db;
  });
}

export function summarizeBills(bills, t) {
  const summary = { due: 0, review: 0, paid: 0, overdue: 0, outstanding: 0, paidTotal: 0 };
  for (const bill of bills) {
    const meta = billStatusMeta(bill, t);
    summary[meta.group] += 1;
    if (meta.group === "due") summary.outstanding += billAmount(bill);
    if (meta.group === "paid") summary.paidTotal += billAmount(bill);
    if (meta.key === "overdue") summary.overdue += 1;
  }
  return summary;
}

function methodLabel(bill, t) {
  const method = String(bill?.payment_method ?? "").toLowerCase();
  if (method === "kuickpay") return t("bills.doc.methodKuickpay");
  if (method === "bank_ach") return t("bills.doc.methodBank");
  if (bill?.payment_proof) return t("bills.doc.methodProof");
  return null;
}

function documentNumber(prefix, kind, id) {
  return `${prefix}-${kind === "unit" ? "UB" : "AB"}-${String(id ?? 0).padStart(6, "0")}`;
}

/**
 * Normalises an amenity or unit bill into what the invoice / receipt card shows.
 * `kind` is "amenity" or "unit".
 */
export function buildBillDocument(bill, { kind, user, communityId, t }) {
  const status = billStatusMeta(bill, t);
  const paid = status.group === "paid";
  const id = kind === "unit" ? bill.id : bill.resident_bill_id ?? bill.id;
  const { communityName } = getProfileFields(user, communityId);
  const proof = bill.payment_proof ?? null;
  const ack = bill.payment_acknowledgement ?? null;
  const unitNumber = bill.unit_number || user?.unit?.unit_number || null;

  const title = kind === "unit"
    ? bill.title || bill.service_name
    : bill.title || bill.amenity_name;
  const service = kind === "unit" ? bill.service_name : bill.amenity_name;
  const period = kind === "unit" ? bill.billing_period_label : bill.billing_month_label;

  return {
    kind,
    type: paid ? "receipt" : "invoice",
    number: documentNumber(paid ? "RCP" : "INV", kind, id),
    title,
    service: service && service !== title ? service : null,
    period: period || null,
    description: bill.description || null,
    issuedOn: formatBillDate(bill.published_at || bill.issued_at || bill.created_at),
    dueOn: formatBillDate(bill.due_date),
    amount: billAmount(bill),
    amountLabel: formatCommunityMoney(billAmount(bill)),
    status,
    billedTo: user?.name || null,
    unitNumber,
    payTo: communityName || null,
    paidOn: paid ? formatBillDate(ack?.payment_date || proof?.payment_date || bill.paid_at || bill.approved_at) : null,
    method: paid ? methodLabel(bill, t) : null,
    reference: ack?.payment_reference || proof?.payment_reference || null,
    rejectionReason: status.key === "rejected" ? bill.rejection_reason || null : null,
    paymentInstructions: bill.payment_instructions || null,
    attachmentUrl: bill.file_url || bill.invoice?.file_url || null,
    proofUrl: proof?.file_url || null,
  };
}
