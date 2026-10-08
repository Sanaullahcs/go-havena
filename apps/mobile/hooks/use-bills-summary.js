import { useCallback, useEffect, useState } from "react";
import { fetchMyAmenityBills } from "../services/amenity-api";
import { fetchPayments, fetchUtilityAccounts } from "../services/payments-api";
import { fetchServiceBills, resolveViewerBillingAccess } from "../services/property-services-api";
import { usesKuickpay } from "../utils/payment-provider";
import { useSessionUser } from "./use-session-user";

const DUE_SERVICE = ["unpaid", "overdue", "rejected", "acknowledged"];
const DUE_AMENITY = ["unpaid", "overdue", "rejected"];
const CACHE_MS = 60_000;

let cache = null;
const listeners = new Set();

function isOverdue(dueDate, status) {
  if (status === "overdue") return true;
  if (!dueDate) return false;
  const due = new Date(`${String(dueDate).slice(0, 10)}T23:59:59`);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

function group(rows, amountOf) {
  return {
    count: rows.length,
    total: rows.reduce((sum, row) => sum + Number(amountOf(row) || 0), 0),
    overdue: rows.filter((row) => row.overdue).length,
    processing: rows.filter((row) => row.processing).length,
    nextDue: rows.map((row) => row.due).filter(Boolean).sort()[0] ?? null,
  };
}

async function loadSummary(kuickpay) {
  const [access, serviceBills, amenityBills, utilities, payments] = await Promise.all([
    resolveViewerBillingAccess().catch(() => ({ isBillingContact: false })),
    fetchServiceBills().catch(() => []),
    fetchMyAmenityBills().catch(() => []),
    kuickpay ? fetchUtilityAccounts().catch(() => ({ accounts: [], meta: {} })) : Promise.resolve({ accounts: [], meta: {} }),
    kuickpay ? fetchPayments({ status: "all" }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
  ]);

  const unit = (access.isBillingContact ? serviceBills : [])
    .filter((bill) => DUE_SERVICE.includes(String(bill.status)))
    .map((bill) => ({
      amount: bill.amount,
      due: bill.due_date,
      overdue: isOverdue(bill.due_date, bill.status),
      processing: bill.online_payment?.active_payment?.status === "processing",
    }));

  const amenity = amenityBills
    .filter((bill) => DUE_AMENITY.includes(String(bill.status)))
    .map((bill) => ({
      amount: bill.amount ?? bill.resident_amount ?? bill.amount_per_resident,
      due: bill.due_date,
      overdue: isOverdue(bill.due_date, bill.status),
      processing: bill.online_payment?.active_payment?.status === "processing",
    }));

  const utility = (utilities.accounts ?? [])
    .map((account) => account.current_bill)
    .filter((bill) => bill && bill.status === "unpaid")
    .map((bill) => ({
      amount: bill.payable_amount,
      due: bill.due_date,
      overdue: Boolean(bill.is_past_due),
      processing: bill.online_payment?.active_payment?.status === "processing",
    }));

  const groups = {
    unit: group(unit, (row) => row.amount),
    amenity: group(amenity, (row) => row.amount),
    utility: group(utility, (row) => row.amount),
  };
  const all = [...unit, ...amenity, ...utility];

  return {
    kuickpay,
    isBillingContact: Boolean(access.isBillingContact),
    utilitiesEnabled: Boolean(utilities.meta?.enabled),
    linkedUtilities: (utilities.accounts ?? []).length,
    groups,
    dueCount: all.length,
    dueTotal: all.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    overdueCount: all.filter((row) => row.overdue).length,
    processingCount: all.filter((row) => row.processing).length,
    nextDue: all.map((row) => row.due).filter(Boolean).sort()[0] ?? null,
    recentPayments: (payments.items ?? []).slice(0, 3),
    loadedAt: Date.now(),
  };
}

/** Everything due across unit, amenity and utility bills, shared by the Home quick action and the Bills hub. */
export function useBillsSummary({ enabled = true } = {}) {
  const sessionUser = useSessionUser();
  const kuickpay = usesKuickpay(sessionUser);
  const [summary, setSummary] = useState(() => cache?.data ?? null);
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return null;
    if (!force && cache && cache.kuickpay === kuickpay && Date.now() - cache.at < CACHE_MS) {
      setSummary(cache.data);
      setLoading(false);
      return cache.data;
    }
    const data = await loadSummary(kuickpay);
    cache = { at: Date.now(), kuickpay, data };
    listeners.forEach((listener) => listener(data));
    setLoading(false);
    return data;
  }, [enabled, kuickpay]);

  useEffect(() => {
    const listener = (data) => setSummary(data);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return { summary, loading, refresh, kuickpay };
}

export function invalidateBillsSummary() {
  cache = null;
}
