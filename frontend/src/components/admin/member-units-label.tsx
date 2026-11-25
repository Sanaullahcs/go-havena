"use client";

import type { ReactNode } from "react";

export type MemberUnitLike = {
  unit_number?: string | null;
  /** When set, only active (and invite) rows count toward hover labels. */
  association_status?: string | null;
};

function isCountableAssociationStatus(
  status: string | null | undefined,
  allowPending = false,
): boolean {
  const key = String(status || "active").toLowerCase();
  if (key === "active" || key === "invite") return true;
  // Join requests with no active units still need the requested unit numbers visible.
  return allowPending && key === "pending";
}

/** Collect unique unit numbers from list payloads / legacy single fields. */
export function resolveUnitNumbers(source: {
  units?: Array<MemberUnitLike | string> | null;
  unit_number?: string | null;
  unit?: string | null;
  user_unit?: string | null;
  seller_unit?: string | null;
  user_units?: Array<MemberUnitLike | string> | null;
  seller_units?: Array<MemberUnitLike | string> | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: unknown, allowPending = false) => {
    if (typeof raw === "object" && raw && "association_status" in raw) {
      if (!isCountableAssociationStatus((raw as MemberUnitLike).association_status, allowPending)) {
        return;
      }
    }

    const value =
      typeof raw === "string"
        ? raw.trim()
        : typeof raw === "object" && raw && "unit_number" in raw
          ? String((raw as MemberUnitLike).unit_number ?? "").trim()
          : "";
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };

  for (const row of source.units ?? []) push(row);
  for (const row of source.user_units ?? []) push(row);
  for (const row of source.seller_units ?? []) push(row);

  if (out.length === 0) {
    for (const row of source.units ?? []) push(row, true);
    for (const row of source.user_units ?? []) push(row, true);
    for (const row of source.seller_units ?? []) push(row, true);
  }

  // Prefer explicit unit lists (already status-filtered). Only fall back to
  // single profile fields when the caller did not send a community-scoped list.
  // An empty `units` array means "none in this community" — do not show another home.
  const hasScopedList =
    source.units != null || source.user_units != null || source.seller_units != null;
  if (out.length === 0 && !hasScopedList) {
    push(source.unit_number);
    push(source.unit);
    push(source.user_unit);
    push(source.seller_unit);
  }

  return out;
}

type MemberUnitsLabelProps = {
  units?: Array<MemberUnitLike | string> | null;
  unitNumber?: string | null;
  /** Alternate single-unit fields used by chat / bookings / listings. */
  unit?: string | null;
  userUnit?: string | null;
  sellerUnit?: string | null;
  userUnits?: Array<MemberUnitLike | string> | null;
  sellerUnits?: Array<MemberUnitLike | string> | null;
  /** Prefixed copy for inline subtitles, e.g. "Unit 100" / "Multiple units". */
  variant?: "table" | "inline";
  empty?: ReactNode;
  className?: string;
};

function HoverCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <span
      role="tooltip"
      className="absolute left-0 top-full z-[80] hidden w-max min-w-[9.5rem] max-w-[18rem] pt-1.5 group-hover/tip:block"
    >
      <span
        aria-hidden
        className="absolute left-4 top-0.5 h-3 w-3 rotate-45 border-l border-t border-slate-200/90 bg-white"
      />
      <span className="relative block overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_12px_28px_-8px_rgba(15,61,95,0.22)] ring-1 ring-slate-900/5">
        <span className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-[#F4FBFD] to-white px-3 py-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#D1FAF5] text-[#0D9488]">
            <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden>
              <path
                d="M2.5 13.5V6.8L8 2.5l5.5 4.3v6.7H9.6V9.4H6.4v4.1H2.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            {title}
          </span>
        </span>
        <span className="block max-h-48 space-y-0.5 overflow-y-auto overscroll-contain p-1.5">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
            >
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 px-1 text-[10px] font-bold tabular-nums text-slate-500">
                {index + 1}
              </span>
              <span className="truncate text-[12.5px] font-semibold tracking-wide text-[#1B4F8A]">
                {item}
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

function UnitsHoverCard({ unitList }: { unitList: string[] }) {
  return <HoverCard title={`${unitList.length} units`} items={unitList} />;
}

export function MemberCommunitiesLabel({
  communities,
  fallbackName,
}: {
  communities?: Array<{ id?: number | null; name?: string | null }> | null;
  fallbackName?: string | null;
}) {
  const names = Array.from(
    new Set(
      (communities ?? [])
        .map((row) => String(row?.name ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (names.length === 0 && fallbackName?.trim()) {
    names.push(fallbackName.trim());
  }
  if (names.length === 0) {
    return <span className="text-[12px] text-slate-400">—</span>;
  }
  if (names.length === 1) {
    return <span className="text-[12.5px] text-slate-600">{names[0]}</span>;
  }

  return (
    <span className="group/tip relative z-10 inline-flex cursor-default items-center hover:z-[80]">
      <span className="inline-flex items-center gap-1 rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#1D4ED8] transition group-hover/tip:border-[#BFDBFE] group-hover/tip:bg-[#DBEAFE] group-hover/tip:shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" aria-hidden />
        Multiple Communities
        <span className="rounded-full bg-white/80 px-1.5 py-px text-[10px] font-bold tabular-nums text-[#1D4ED8]">
          {names.length}
        </span>
      </span>
      <HoverCard title={`${names.length} communities`} items={names} />
    </span>
  );
}

export function ResidentDirectoryUnitsLabel({
  communities,
  units,
  unitNumber,
}: {
  communities?: Array<{
    name?: string | null;
    units?: Array<{ unit_number?: string | null; association_status?: string | null } | string> | null;
  }> | null;
  units?: Array<{ unit_number?: string | null; community_name?: string | null; association_status?: string | null } | string> | null;
  unitNumber?: string | null;
}) {
  const communityRows = (communities ?? []).map((community) => {
    const numbers = resolveUnitNumbers({ units: community.units ?? [] });
    return {
      name: String(community.name ?? "").trim(),
      numbers,
    };
  }).filter((row) => row.numbers.length > 0);

  if (communityRows.length > 1) {
    const items = communityRows.flatMap((row) =>
      row.numbers.map((number) => (row.name ? `${number} · ${row.name}` : number)),
    );
    return (
      <span className="group/tip relative z-10 inline-flex cursor-default items-center hover:z-[80]">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#CFFAFE] bg-[#F0FDFA] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#0F766E] transition group-hover/tip:border-[#99F6E4] group-hover/tip:bg-[#CCFBF1] group-hover/tip:shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#14B8A6]" aria-hidden />
          Multiple Units
          <span className="rounded-full bg-white/80 px-1.5 py-px text-[10px] font-bold tabular-nums text-[#0D9488]">
            {items.length}
          </span>
        </span>
        <HoverCard title={`${items.length} units`} items={items} />
      </span>
    );
  }

  return <MemberUnitsLabel units={units} unitNumber={unitNumber} />;
}

/**
 * Table / list unit display: one number, or "Multiple" with hover listing all units.
 */
export function MemberUnitsLabel({
  units,
  unitNumber,
  unit,
  userUnit,
  sellerUnit,
  userUnits,
  sellerUnits,
  variant = "table",
  empty = <span className="text-[12px] text-slate-400">—</span>,
  className = "",
}: MemberUnitsLabelProps) {
  const unitList = resolveUnitNumbers({
    units,
    unit_number: unitNumber,
    unit,
    user_unit: userUnit,
    seller_unit: sellerUnit,
    user_units: userUnits,
    seller_units: sellerUnits,
  });

  if (unitList.length === 0) {
    return <>{empty}</>;
  }

  if (unitList.length === 1) {
    if (variant === "inline") {
      return <span className={className}>Unit {unitList[0]}</span>;
    }
    return <span className={`font-mono text-[12px] ${className}`.trim()}>{unitList[0]}</span>;
  }

  if (variant === "inline") {
    return (
      <span
        className={`group/tip relative z-10 inline-flex cursor-default items-center hover:z-[80] ${className}`.trim()}
      >
        <span className="font-medium text-[#1B4F8A] underline decoration-dotted decoration-[#94A3B8] underline-offset-[3px] transition group-hover/tip:decoration-[#1B4F8A]">
          Multiple units
        </span>
        <UnitsHoverCard unitList={unitList} />
      </span>
    );
  }

  return (
    <span
      className={`group/tip relative z-10 inline-flex cursor-default items-center hover:z-[80] ${className}`.trim()}
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-[#CFFAFE] bg-[#F0FDFA] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#0F766E] transition group-hover/tip:border-[#99F6E4] group-hover/tip:bg-[#CCFBF1] group-hover/tip:shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-[#14B8A6]" aria-hidden />
        Multiple
        <span className="rounded-full bg-white/80 px-1.5 py-px text-[10px] font-bold tabular-nums text-[#0D9488]">
          {unitList.length}
        </span>
      </span>
      <UnitsHoverCard unitList={unitList} />
    </span>
  );
}
