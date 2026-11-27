"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronDown, Clock3, Home, KeyRound, MoreHorizontal, Search, UserRound, Users, X } from "lucide-react";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { toastError } from "@/lib/alert";
import { occupancyLabel, type LandlordOccupancy, type LandlordPortfolioUnit } from "@/lib/api/landlord";

const STATUS = {
  live_here: { label: "Living in", className: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  rented: { label: "Rented", className: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  vacant: { label: "Vacant", className: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-800", dot: "bg-amber-400" },
} as const;

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "live_here", label: "Living in" },
  { value: "rented", label: "Rented" },
  { value: "vacant", label: "Vacant" },
  { value: "pending", label: "Pending" },
] as const;

export type PropertyRow = {
  key: string;
  unitNumber: string;
  phase: "approved" | "pending";
  occupancy: LandlordOccupancy | null;
  residentCount: number;
  residentNames: string[];
  billingContact: string | null;
  claimedAt: string | null;
  unitId: number;
  isBillingContact: boolean;
  nominees: Array<{ id: number; name: string }>;
  unitResidents: Array<{ id: number; name: string; isBillingContact: boolean }>;
  outgoingTransfer: { id: number; nomineeName: string } | null;
  ownershipId?: number;
  canPay: boolean;
};

function shareLabel(count: number, total: number) {
  if (total < 1) return "No owned units yet";
  const pct = Math.round((count / total) * 100);
  return `${pct}% of owned units`;
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-[1.7rem] font-bold leading-none tabular-nums tracking-tight text-slate-900">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F8F4] text-[#0F766E]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[12px] text-slate-400">{hint}</p>
    </article>
  );
}

function residentNames(unit: LandlordPortfolioUnit) {
  return (unit.residents ?? [])
    .filter((person) => person.status !== "left")
    .map((person) => person.name?.trim() || person.email || "Resident")
    .filter(Boolean);
}

export function LandlordPropertiesView({
  totalOwned,
  rented,
  vacant,
  pending,
  livingIn,
  rows,
  occupancyOptions,
  onOccupancyChange,
  onRequestBillingTransfer,
  onCancelBillingTransfer,
  headerAction,
  claimForm,
}: {
  totalOwned: number;
  rented: number;
  vacant: number;
  pending: number;
  livingIn: number;
  rows: PropertyRow[];
  occupancyOptions: LandlordOccupancy[];
  onOccupancyChange: (ownershipId: number, occupancy: LandlordOccupancy) => void | Promise<void>;
  onRequestBillingTransfer?: (unitId: number, nomineeUserId: number) => Promise<void>;
  onCancelBillingTransfer?: (requestId: number) => Promise<void>;
  headerAction?: ReactNode;
  claimForm?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ key: string; top: number; left: number; above: boolean } | null>(null);
  const [viewing, setViewing] = useState<PropertyRow | null>(null);
  const [changing, setChanging] = useState<PropertyRow | null>(null);
  const [blocked, setBlocked] = useState<PropertyRow | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [transferring, setTransferring] = useState<PropertyRow | null>(null);
  const [nomineeId, setNomineeId] = useState<number | null>(null);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuRow = rows.find((row) => row.key === menu?.key) ?? null;
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const statusKey = row.phase === "pending" ? "pending" : (row.occupancy ?? "vacant");
      if (statusFilter !== "all" && statusKey !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [row.unitNumber, row.billingContact, row.residentNames.join(" "), STATUS[statusKey].label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, statusFilter]);

  useEffect(() => {
    if (!filterOpen) return;
    function onPointer(event: MouseEvent) {
      if (filterRef.current?.contains(event.target as Node)) return;
      setFilterOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  useEffect(() => {
    if (!menu && !viewing && !changing && !blocked && !transferring) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenu(null);
      setViewing(null);
      setChanging(null);
      setBlocked(null);
      setTransferring(null);
    }
    function onPointer(event: MouseEvent) {
      if (!menu) return;
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-row-menu]")) return;
      setMenu(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [menu, viewing, changing, blocked, transferring]);

  function openMenu(row: PropertyRow, button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const above = window.innerHeight - rect.bottom < 120;
    setMenu((current) =>
      current?.key === row.key
        ? null
        : { key: row.key, top: above ? rect.top - 6 : rect.bottom + 6, left: rect.right, above },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[1.35rem]">My Properties</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Units you own: the home you live in, units you rent out, and units that are vacant.
          </p>
        </div>
        {headerAction}
      </div>

      {claimForm}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard
          label="Total owned units"
          value={String(totalOwned)}
          hint="Approved ownership"
          icon={<Building2 className="h-[18px] w-[18px]" />}
        />
        <MetricCard
          label="Rented units"
          value={String(rented)}
          hint={shareLabel(rented, totalOwned)}
          icon={<KeyRound className="h-[18px] w-[18px]" />}
        />
        <MetricCard
          label="Vacant units"
          value={String(vacant)}
          hint={vacant === 0 ? "None sitting empty" : shareLabel(vacant, totalOwned)}
          icon={<Home className="h-[18px] w-[18px]" />}
        />
        <MetricCard
          label="Claimed pending"
          value={String(pending)}
          hint={pending === 0 ? "No claims waiting" : "Waiting for community admin"}
          icon={<Clock3 className="h-[18px] w-[18px]" />}
        />
        <MetricCard
          label="Living in (You)"
          value={String(livingIn)}
          hint={livingIn === 0 ? "You do not live in an owned unit" : "Owned units you live in"}
          icon={<UserRound className="h-[18px] w-[18px]" />}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Owned units</h2>
            <p className="text-[12px] text-slate-400">
              {visibleRows.length === rows.length
                ? "Status and actions for each unit you own"
                : `${visibleRows.length} of ${rows.length} units`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search unit, resident, contact"
                className="h-9 w-60 rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 text-[13px] text-slate-800 outline-none transition focus:border-[#99F6E4] focus:bg-white focus:ring-2 focus:ring-[#CCFBF1]"
              />
            </label>
            <div ref={filterRef} className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((open) => !open)}
                className={`inline-flex h-9 min-w-[9.5rem] items-center justify-between gap-2 rounded-xl border bg-white px-3 text-[13px] font-medium text-slate-700 transition ${
                  filterOpen ? "border-[#99F6E4] ring-2 ring-[#CCFBF1]" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {statusFilter !== "all" ? (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS[statusFilter].dot}`} />
                  ) : null}
                  <span className="truncate">{STATUS_FILTERS.find((item) => item.value === statusFilter)?.label}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition duration-150 ${filterOpen ? "rotate-180" : ""}`} />
              </button>
              <div
                role="listbox"
                aria-label="Filter by status"
                className={`absolute right-0 top-[calc(100%+6px)] z-30 w-52 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.1)] transition duration-150 ${
                  filterOpen ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
                }`}
              >
                {STATUS_FILTERS.map((item) => {
                  const selected = statusFilter === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setStatusFilter(item.value);
                        setFilterOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                        selected ? "bg-[#E7F8F4] font-semibold text-[#0F766E]" : "font-medium text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.value === "all" ? "bg-slate-300" : STATUS[item.value].dot}`} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-slate-400">
            No owned units yet. Claim a unit to add it here.
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-slate-400">No units match this search.</p>
        ) : (
          <div className="overflow-x-auto rounded-b-2xl">
            <table className="min-w-[860px] w-full text-left">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">Unit</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold">Residents</th>
                  <th className="px-5 py-2.5 font-semibold">Billing contact</th>
                  <th className="px-5 py-2.5 font-semibold">Claimed</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const status = row.phase === "pending" ? STATUS.pending : STATUS[row.occupancy ?? "vacant"];
                  const names = row.residentNames.slice(0, 2).join(", ");
                  const extra = row.residentNames.length - 2;
                  return (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E7F8F4] text-[#0F766E]">
                            <Home className="h-4 w-4" strokeWidth={2} />
                          </span>
                          <span className="text-[14px] font-semibold text-slate-900">{row.unitNumber}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                          <Users className="h-3.5 w-3.5 text-[#0F766E]" />
                          {row.residentCount}
                        </span>
                        <p className="mt-0.5 max-w-[220px] truncate text-[12px] text-slate-400">
                          {row.residentCount === 0
                            ? "No residents"
                            : `${names}${extra > 0 ? ` +${extra}` : ""}`}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-700">
                        {row.phase === "pending" ? (
                          <span className="text-[13px] text-slate-400">Waiting for admin approval</span>
                        ) : row.billingContact ? (
                          row.billingContact
                        ) : (
                          <span className="text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] tabular-nums text-slate-600">{formatClaimed(row.claimedAt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          data-row-menu
                          aria-label={`Actions for unit ${row.unitNumber}`}
                          aria-expanded={menu?.key === row.key}
                          onClick={(event) => openMenu(row, event.currentTarget)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {menu && menuRow ? (
        <div
          ref={menuRef}
          role="menu"
          className={`fixed z-50 w-56 -translate-x-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg ${menu.above ? "-translate-y-full" : ""}`}
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setViewing(menuRow);
              setMenu(null);
            }}
          >
            View
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={menuRow.phase !== "approved" || !menuRow.ownershipId}
            className="block w-full px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            onClick={() => {
              setChanging(menuRow);
              setMenu(null);
            }}
          >
            Change status
          </button>
          {menuRow.phase === "approved" && menuRow.isBillingContact ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setNomineeId(null);
                setTransferring(menuRow);
                setMenu(null);
              }}
            >
              Change Billing Contact
            </button>
          ) : null}
        </div>
      ) : null}

      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setViewing(null)}>
          <div
            role="dialog"
            aria-labelledby="unit-view-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Unit details</p>
                <h3 id="unit-view-title" className="mt-1 text-lg font-semibold text-slate-900">
                  Unit {viewing.unitNumber}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setViewing(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Status</dt>
                <dd>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${(viewing.phase === "pending" ? STATUS.pending : STATUS[viewing.occupancy ?? "vacant"]).className}`}>
                    {viewing.phase === "pending" ? "Pending" : STATUS[viewing.occupancy ?? "vacant"].label}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Residents</dt>
                <dd className="mt-1 text-slate-800">
                  {viewing.residentNames.length > 0 ? viewing.residentNames.join(", ") : "No residents"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Billing contact</dt>
                <dd className="font-medium text-slate-800">
                  {viewing.phase === "pending" ? "Waiting for admin approval" : viewing.billingContact || "Not set"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {changing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setChanging(null)}>
          <div
            role="dialog"
            aria-labelledby="unit-status-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Change status</p>
                <h3 id="unit-status-title" className="mt-1 text-lg font-semibold text-slate-900">
                  Unit {changing.unitNumber}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setChanging(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {occupancyOptions.map((option) => {
                const current = changing.occupancy === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={savingStatus}
                    onClick={() => {
                      if (current || !changing.ownershipId) {
                        setChanging(null);
                        return;
                      }
                      const row = changing;
                      setSavingStatus(true);
                      void Promise.resolve(onOccupancyChange(row.ownershipId!, option))
                        .then(() => setChanging(null))
                        .catch((err) => {
                          if (isResidentMoveOutBlock(err)) {
                            setChanging(null);
                            setBlocked(row);
                            return;
                          }
                          toastError(apiError(err));
                        })
                        .finally(() => setSavingStatus(false));
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium ${
                      current
                        ? "border-[#CFF3EA] bg-[#E7F8F4] text-[#0F766E]"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {occupancyLabel(option)}
                    {current ? <span className="text-[11px] font-semibold">Current</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {blocked ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setBlocked(null)}>
          <div
            role="dialog"
            aria-labelledby="status-blocked-title"
            aria-describedby="status-blocked-body"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Users className="h-5 w-5" strokeWidth={1.9} />
            </div>
            <h3 id="status-blocked-title" className="mt-4 text-lg font-semibold text-slate-900">
              Status cannot be changed
            </h3>
            <p id="status-blocked-body" className="mt-2 text-[14px] leading-relaxed text-slate-600">
              You cannot change the status of this unit until the residents currently living in it have moved out.
            </p>
            <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-500">
              Unit {blocked.unitNumber} still has {blocked.residentCount === 1 ? "a resident" : `${blocked.residentCount} residents`} on the tenancy. Once they have moved out, you can update how this unit is used.
            </p>
            <button
              type="button"
              onClick={() => setBlocked(null)}
              className="mt-5 w-full rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#163f6e]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {transferring ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setTransferring(null)}>
          <div
            role="dialog"
            aria-labelledby="billing-transfer-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Billing contact</p>
                <h3 id="billing-transfer-title" className="mt-1 text-lg font-semibold text-slate-900">
                  Unit {transferring.unitNumber}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setTransferring(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
              Choose a resident of this unit. They become the billing contact only after they accept. If they decline, you remain the billing contact.
            </p>
            {transferring.outgoingTransfer ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-900">
                Waiting for {transferring.outgoingTransfer.nomineeName} to accept or decline.
              </p>
            ) : transferring.unitResidents.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-500">
                This unit has no residents yet. Someone else has to live here before you can send a request.
              </p>
            ) : (
              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {transferring.unitResidents.map((resident) => {
                  const selected = !resident.isBillingContact && nomineeId === resident.id;
                  return (
                    <button
                      key={resident.id}
                      type="button"
                      disabled={resident.isBillingContact}
                      onClick={() => setNomineeId(resident.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium disabled:cursor-default ${
                        resident.isBillingContact
                          ? "border-slate-200 bg-slate-50 text-slate-400"
                          : selected
                            ? "border-[#CFF3EA] bg-[#E7F8F4] text-[#0F766E]"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${selected ? "bg-white text-[#0F766E]" : "bg-white text-slate-400"}`}>
                          <UserRound className="h-4 w-4" />
                        </span>
                        {resident.name}
                      </span>
                      {resident.isBillingContact ? (
                        <span className="text-[11px] font-semibold">Current</span>
                      ) : selected ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </button>
                  );
                })}
                {transferring.nominees.length === 0 ? (
                  <p className="px-1 pt-1 text-[12px] leading-relaxed text-slate-400">
                    You are the only resident of this unit, so there is no one else to ask.
                  </p>
                ) : null}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setTransferring(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
              {transferring.outgoingTransfer ? (
                <button
                  type="button"
                  disabled={savingTransfer}
                  onClick={() => {
                    const requestId = transferring.outgoingTransfer?.id;
                    if (!requestId || !onCancelBillingTransfer) return;
                    setSavingTransfer(true);
                    void onCancelBillingTransfer(requestId)
                      .then(() => setTransferring(null))
                      .catch((err) => toastError(apiError(err)))
                      .finally(() => setSavingTransfer(false));
                  }}
                  className="flex-1 rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#163f6e] disabled:opacity-60"
                >
                  {savingTransfer ? "Withdrawing…" : "Withdraw request"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={savingTransfer || !nomineeId || transferring.nominees.length === 0 || !onRequestBillingTransfer}
                  onClick={() => {
                    if (!nomineeId || !onRequestBillingTransfer) return;
                    setSavingTransfer(true);
                    void onRequestBillingTransfer(transferring.unitId, nomineeId)
                      .then(() => setTransferring(null))
                      .catch((err) => toastError(apiError(err)))
                      .finally(() => setSavingTransfer(false));
                  }}
                  className="flex-1 rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#163f6e] disabled:opacity-60"
                >
                  {savingTransfer ? "Sending…" : "Send request"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isResidentMoveOutBlock(err: unknown) {
  const fields = apiFieldErrors(err);
  const message = `${fields.occupancy ?? ""} ${apiError(err)}`.toLowerCase();
  return /resident|tenancy|moved out|live here/.test(message);
}

const CLAIMED_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatClaimed(value: string | null) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const month = CLAIMED_MONTHS[Number(match[2]) - 1];
    if (month) return `${month} ${Number(match[3])}, ${match[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${CLAIMED_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function namesForUnit(unit: LandlordPortfolioUnit) {
  return residentNames(unit);
}
