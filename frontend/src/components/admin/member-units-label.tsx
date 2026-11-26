"use client";

import type { ReactNode } from "react";
import { Building2, Home, Layers } from "lucide-react";

export type MemberUnitLike = {
  unit_number?: string | null;
  association_status?: string | null;
  occupancy?: string | null;
  ownership_status?: string | null;
};

export type MemberOccupancyKind = "resident" | "landlord" | "other";

/** Landlord when they own approved vacant/rented units; else resident when they live in the community. */
export function deriveMemberOccupancyKind(units?: Array<MemberUnitLike | string> | null): MemberOccupancyKind {
  const rows = (units ?? []).filter((row): row is MemberUnitLike => typeof row === "object" && row !== null);
  const hasLandlordPortfolio = rows.some((row) => {
    if (String(row.association_status ?? "").toLowerCase() !== "ownership") return false;
    if (String(row.ownership_status ?? "approved").toLowerCase() !== "approved") return false;
    const occ = String(row.occupancy ?? "").toLowerCase();
    return occ === "vacant" || occ === "rented";
  });
  if (hasLandlordPortfolio) return "landlord";
  const hasActiveResidency = rows.some((row) => String(row.association_status ?? "").toLowerCase() === "active");
  if (hasActiveResidency) return "resident";
  return "other";
}

export function memberOccupancyLabel(kind: MemberOccupancyKind): string {
  if (kind === "landlord") return "Landlord";
  if (kind === "resident") return "Resident";
  return "Member";
}

function isApprovedOwnershipRow(row: MemberUnitLike): boolean {
  return String(row.ownership_status ?? "approved").toLowerCase() === "approved";
}

/** Admin members table: approved associations only; landlord portfolio = vacant / rented. */
export function unitCountsForMembersTable(units?: Array<MemberUnitLike | string> | null): Array<MemberUnitLike | string> {
  return (units ?? []).filter((row) => {
    if (typeof row === "string") return true;
    if (!row || typeof row !== "object") return false;

    const status = String(row.association_status ?? "").toLowerCase();
    if (status === "pending" || status === "rejected" || status === "invite") return false;

    if (status === "ownership") {
      if (!isApprovedOwnershipRow(row)) return false;
      const occ = String(row.occupancy ?? "").toLowerCase();
      return occ === "vacant" || occ === "rented";
    }

    return status === "active";
  });
}

function isCountableAssociationStatus(status: string | null | undefined): boolean {
  const key = String(status || "active").toLowerCase();
  return key === "active" || key === "ownership";
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
  /** When true, legacy single-unit fields are ignored if a scoped unit list was provided (even empty). */
  strictScopedList?: boolean;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: unknown) => {
    if (typeof raw === "object" && raw && "association_status" in raw) {
      if (!isCountableAssociationStatus((raw as MemberUnitLike).association_status)) {
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

  const hasScopedList =
    source.units != null || source.user_units != null || source.seller_units != null;
  const strictScoped = source.strictScopedList ?? false;

  if (out.length === 0 && (!hasScopedList || !strictScoped)) {
    push(source.unit_number);
    push(source.unit);
    push(source.user_unit);
    push(source.seller_unit);
  }

  return out;
}

function unitRows(units?: Array<MemberUnitLike | string> | null): MemberUnitLike[] {
  return (units ?? []).filter((row): row is MemberUnitLike => typeof row === "object" && row !== null);
}

function activeResidenceUnits(units?: Array<MemberUnitLike | string> | null): MemberUnitLike[] {
  return unitRows(units).filter((row) => String(row.association_status ?? "").toLowerCase() === "active");
}

function isOwnerOnlyAssociation(units?: Array<MemberUnitLike | string> | null): boolean {
  const rows = unitRows(units);
  if (rows.length === 0) return false;
  return rows.every((row) => String(row.association_status ?? "").toLowerCase() === "ownership");
}

type MemberUnitsLabelProps = {
  units?: Array<MemberUnitLike | string> | null;
  unitNumber?: string | null;
  unit?: string | null;
  userUnit?: string | null;
  sellerUnit?: string | null;
  userUnits?: Array<MemberUnitLike | string> | null;
  sellerUnits?: Array<MemberUnitLike | string> | null;
  variant?: "table" | "inline" | "summary";
  empty?: ReactNode;
  className?: string;
};

type OccupancyBadgeVariant = "vacant" | "rented" | "residence" | "muted";

type UnitHoverRow = {
  unitNumber: string;
  badge?: { text: string; variant: OccupancyBadgeVariant };
};

const OCCUPANCY_BADGE_CLASS: Record<OccupancyBadgeVariant, string> = {
  vacant: "bg-amber-50 text-amber-900 ring-amber-200/90",
  rented: "bg-sky-50 text-sky-900 ring-sky-200/90",
  residence: "bg-emerald-50 text-emerald-900 ring-emerald-200/90",
  muted: "bg-slate-100 text-slate-600 ring-slate-200/90",
};

function occupancyBadgeForRow(row: MemberUnitLike): UnitHoverRow["badge"] | undefined {
  const status = String(row.association_status ?? "").toLowerCase();
  const occKey = String(row.occupancy ?? "").toLowerCase();

  if (status === "ownership") {
    if (occKey === "vacant") return { text: "Vacant", variant: "vacant" };
    if (occKey === "rented") return { text: "Rented out", variant: "rented" };
    return undefined;
  }

  if (status === "active") {
    return { text: "Residence", variant: "residence" };
  }

  return undefined;
}

function unitHoverRows(units?: Array<MemberUnitLike | string> | null): UnitHoverRow[] {
  return unitRows(units)
    .map((row) => {
      const unitNumber = String(row.unit_number ?? "").trim();
      if (!unitNumber) return null;
      return {
        unitNumber,
        badge: occupancyBadgeForRow(row),
      };
    })
    .filter((row): row is UnitHoverRow => row !== null);
}

function UnitHoverCard({
  title,
  rows,
  accent = "resident",
}: {
  title: string;
  rows: UnitHoverRow[];
  accent?: "resident" | "landlord" | "neutral";
}) {
  const accentBg =
    accent === "landlord" ? "bg-indigo-50 text-indigo-600" : accent === "resident" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-600";
  const Icon = accent === "landlord" ? Building2 : Home;

  return (
    <span
      role="tooltip"
      className="absolute left-0 top-full z-[80] hidden w-[15.5rem] max-w-[min(17.5rem,calc(100vw-2rem))] pt-2.5 group-hover/tip:block"
    >
      <span
        aria-hidden
        className="absolute left-5 top-1 h-2.5 w-2.5 rotate-45 border-l border-t border-slate-200 bg-white"
      />
      <span className="relative block overflow-hidden rounded-xl border border-slate-200/95 bg-white shadow-[0_20px_45px_-14px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/[0.04]">
        <span className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-b from-slate-50/95 to-white px-3.5 py-2.5">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accentBg}`}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-slate-700">{title}</span>
        </span>
        <span className="block max-h-56 overflow-y-auto overscroll-contain py-1.5">
          {rows.map((row, index) => (
            <span
              key={`${row.unitNumber}-${index}`}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-slate-50/80"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold tabular-nums text-slate-500">
                  {index + 1}
                </span>
                <span className="truncate text-[13px] font-bold tracking-tight text-slate-900">{row.unitNumber}</span>
              </span>
              {row.badge ? (
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold leading-none ring-1 ring-inset ${OCCUPANCY_BADGE_CLASS[row.badge.variant]}`}
                >
                  {row.badge.text}
                </span>
              ) : null}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

function TextListHoverCard({
  title,
  items,
  accent = "resident",
}: {
  title: string;
  items: string[];
  accent?: "resident" | "landlord" | "neutral";
}) {
  const accentBg =
    accent === "landlord" ? "bg-indigo-50 text-indigo-600" : accent === "resident" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-600";
  const Icon = accent === "landlord" ? Building2 : Home;

  return (
    <span
      role="tooltip"
      className="absolute left-0 top-full z-[80] hidden w-[15rem] max-w-[min(17rem,calc(100vw-2rem))] pt-2.5 group-hover/tip:block"
    >
      <span
        aria-hidden
        className="absolute left-5 top-1 h-2.5 w-2.5 rotate-45 border-l border-t border-slate-200 bg-white"
      />
      <span className="relative block overflow-hidden rounded-xl border border-slate-200/95 bg-white shadow-[0_20px_45px_-14px_rgba(15,23,42,0.22)]">
        <span className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-b from-slate-50/95 to-white px-3.5 py-2.5">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accentBg}`}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-[11px] font-semibold text-slate-700">{title}</span>
        </span>
        <span className="block max-h-52 overflow-y-auto py-1.5">
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="block px-3.5 py-2 text-[12px] font-medium text-slate-800 hover:bg-slate-50/80">
              {item}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

function TipWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`group/tip relative z-10 inline-flex max-w-[11rem] cursor-default justify-start hover:z-[80] ${className}`.trim()}>
      {children}
    </span>
  );
}

function UnitNumberChip({
  number,
  variant,
}: {
  number: string;
  variant: "resident" | "landlord";
}) {
  const isLandlord = variant === "landlord";
  const Icon = isLandlord ? Building2 : Home;

  return (
    <span
      className={[
        "inline-flex w-full min-w-[4.5rem] max-w-[7.25rem] items-center gap-1.5 rounded-lg border px-2.5 py-1",
        isLandlord
          ? "border-indigo-200/80 bg-indigo-50/50"
          : "border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
      ].join(" ")}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${isLandlord ? "text-indigo-500" : "text-sky-700/75"}`}
        strokeWidth={2.25}
        aria-hidden
      />
      <span className={`truncate font-mono text-[12px] font-bold tracking-tight ${isLandlord ? "text-indigo-900" : "text-slate-800"}`}>
        {number}
      </span>
    </span>
  );
}

function MultiUnitsPill({
  count,
  variant,
  subtitle,
}: {
  count: number;
  variant: "resident" | "landlord";
  subtitle?: string;
}) {
  const isLandlord = variant === "landlord";
  const meta = subtitle ?? (isLandlord ? `${count} properties` : `${count} assigned`);

  return (
    <span
      className={[
        "inline-flex w-full min-w-[8.5rem] max-w-[11rem] items-center gap-2 rounded-lg border px-2.5 py-1",
        isLandlord ? "border-indigo-200/80 bg-indigo-50/60" : "border-slate-200 bg-slate-50/80",
      ].join(" ")}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${isLandlord ? "bg-indigo-100 text-indigo-600" : "bg-white text-sky-800 shadow-sm ring-1 ring-slate-200/80"}`}
      >
        {isLandlord ? (
          <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        ) : (
          <Layers className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[11px] font-semibold leading-tight ${isLandlord ? "text-indigo-900" : "text-slate-700"}`}>
          Multiple units
        </span>
        <span className="text-[10px] font-medium text-slate-500">{meta}</span>
      </span>
    </span>
  );
}

function hoverRowsFromUnits(
  units: Array<MemberUnitLike | string> | null | undefined,
  unitList: string[],
): UnitHoverRow[] {
  const structured = unitHoverRows(units);
  if (structured.length > 0) return structured;
  return unitList.map((unitNumber) => ({ unitNumber }));
}

function LandlordUnitsLabel({
  units,
  unitList,
  className = "",
}: {
  units?: Array<MemberUnitLike | string> | null;
  unitList: string[];
  className?: string;
}) {
  const rows = hoverRowsFromUnits(units, unitList);
  const title = unitList.length === 1 ? "Landlord property" : `${unitList.length} properties`;

  if (unitList.length === 1) {
    return (
      <TipWrap className={className}>
        <UnitNumberChip number={unitList[0]} variant="landlord" />
        <UnitHoverCard title={title} rows={rows} accent="landlord" />
      </TipWrap>
    );
  }

  return (
    <TipWrap className={className}>
      <MultiUnitsPill count={unitList.length} variant="landlord" />
      <UnitHoverCard title={title} rows={rows} accent="landlord" />
    </TipWrap>
  );
}

function ResidentUnitsTableLabel({
  units,
  unitList,
  className = "",
}: {
  units?: Array<MemberUnitLike | string> | null;
  unitList: string[];
  className?: string;
}) {
  const rows = hoverRowsFromUnits(units, unitList);
  const actives = activeResidenceUnits(units);
  const hasResidence = actives.length > 0 || deriveMemberOccupancyKind(units) === "resident";

  if (unitList.length === 1) {
    return (
      <TipWrap className={className}>
        <UnitNumberChip number={unitList[0]} variant={hasResidence ? "resident" : "landlord"} />
        {rows.length > 0 ? (
          <UnitHoverCard title={hasResidence ? "Assigned unit" : "Unit"} rows={rows} accent="resident" />
        ) : null}
      </TipWrap>
    );
  }

  return (
    <TipWrap className={className}>
      <MultiUnitsPill count={unitList.length} variant="resident" />
      <UnitHoverCard title={`${unitList.length} units`} rows={rows} accent="resident" />
    </TipWrap>
  );
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
  if (names.length === 0 && fallbackName?.trim()) names.push(fallbackName.trim());
  if (names.length === 0) return <span className="text-xs text-slate-400">—</span>;
  if (names.length === 1) return <span className="text-[12.5px] font-medium text-slate-600">{names[0]}</span>;

  return (
    <TipWrap>
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200/70 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
        <span className="whitespace-nowrap">Multiple communities</span>
        <span className="rounded-md bg-white px-1.5 py-px text-[10px] font-bold tabular-nums text-blue-700">{names.length}</span>
      </span>
      <TextListHoverCard title={`${names.length} communities`} items={names} accent="neutral" />
    </TipWrap>
  );
}

export function ResidentDirectoryUnitsLabel({
  communities,
  units,
  unitNumber,
}: {
  communities?: Array<{
    name?: string | null;
    units?: Array<MemberUnitLike | string> | null;
  }> | null;
  units?: Array<MemberUnitLike | string> | null;
  unitNumber?: string | null;
}) {
  const displayUnits = unitCountsForMembersTable(units);
  const communityRows = (communities ?? [])
    .map((community) => {
      const numbers = resolveUnitNumbers({
        units: unitCountsForMembersTable(community.units ?? []),
        strictScopedList: true,
      });
      return { name: String(community.name ?? "").trim(), numbers };
    })
    .filter((row) => row.numbers.length > 0);

  if (communityRows.length > 1) {
    const items = communityRows.flatMap((row) =>
      row.numbers.map((number) => (row.name ? `${number} · ${row.name}` : number)),
    );
    return (
      <TipWrap>
        <MultiUnitsPill count={items.length} variant="resident" />
        <TextListHoverCard title={`${items.length} units across communities`} items={items} accent="resident" />
      </TipWrap>
    );
  }

  return <MemberUnitsLabel units={displayUnits} unitNumber={unitNumber} />;
}

export function MemberUnitsLabel({
  units,
  unitNumber,
  unit,
  userUnit,
  sellerUnit,
  userUnits,
  sellerUnits,
  variant = "table",
  empty = <span className="text-xs font-medium text-slate-400">—</span>,
  className = "",
}: MemberUnitsLabelProps) {
  const isTable = variant === "table";
  const isSummary = variant === "summary";
  const useTableScope = isTable || isSummary;
  const scopedUnits = useTableScope ? unitCountsForMembersTable(units) : units;
  const unitList = resolveUnitNumbers({
    units: scopedUnits,
    unit_number: unitNumber,
    unit,
    user_unit: userUnit,
    seller_unit: sellerUnit,
    user_units: userUnits,
    seller_units: sellerUnits,
    strictScopedList: useTableScope && units != null,
  });

  if (unitList.length === 0) {
    return <>{empty}</>;
  }

  if (isSummary) {
    if (unitList.length === 1) {
      return <span className={`font-mono text-[13px] font-semibold text-slate-900 ${className}`.trim()}>{unitList[0]}</span>;
    }
    return <span className={`text-[13px] font-semibold text-slate-900 ${className}`.trim()}>Multiple units</span>;
  }

  if (variant === "inline") {
    if (unitList.length === 1) return <span className={className}>Unit {unitList[0]}</span>;
    return (
      <TipWrap className={className}>
        <span className="font-medium text-slate-800 underline decoration-dotted decoration-slate-300 underline-offset-2">
          Multiple units
        </span>
        <TextListHoverCard title={`${unitList.length} units`} items={unitList} accent="resident" />
      </TipWrap>
    );
  }

  if (isOwnerOnlyAssociation(scopedUnits)) {
    return <LandlordUnitsLabel units={scopedUnits} unitList={unitList} className={className} />;
  }

  return <ResidentUnitsTableLabel units={scopedUnits} unitList={unitList} className={className} />;
}