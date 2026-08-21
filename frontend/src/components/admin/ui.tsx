import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NL } from "@/lib/design-tokens";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { ADMIN_BADGE_CLASS, ADMIN_TONE, type AdminTone } from "@/lib/admin/admin-tones";

/* ─── Tone helpers ─── */

type Tone = AdminTone;

const TONE_ACCENT: Record<Tone, string> = Object.fromEntries(
  (Object.keys(ADMIN_TONE) as Tone[]).map((k) => [k, ADMIN_TONE[k].accent]),
) as Record<Tone, string>;

const TONE_TILE = ADMIN_TONE;

/* ─── Badge ─── */

export function AdminBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${ADMIN_BADGE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/* ─── Stat Tile — matches FleetPilot DashboardStatTile ─── */

function parsePercent(value: ReactNode): number | null {
  if (typeof value !== "string" || !value.includes("%")) return null;
  const n = parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "blue",
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon: ReactNode;
  href?: string;
}) {
  const accent = TONE_ACCENT[tone];
  const tile = TONE_TILE[tone];
  const percent = parsePercent(value);

  const inner = (
    <>
      {percent !== null && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/70">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${percent}%`, background: accent }}
          />
        </div>
      )}

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:h-[17px] [&_svg]:w-[17px]"
        style={{ background: tile.iconBg, color: tile.iconColor }}
      >
        {icon}
      </div>

      <div className="relative min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide" style={{ color: NL.textMuted }}>
          {label}
        </p>
        <p className="truncate text-[1.35rem] font-bold tabular-nums leading-tight tracking-tight" style={{ color: tile.value }}>
          {value}
        </p>
        {hint && (
          <p className="truncate text-[11px] leading-tight" style={{ color: NL.textSecondary }}>{hint}</p>
        )}
      </div>
    </>
  );

  const className = [
    "group relative flex min-h-[4.25rem] items-center gap-3 overflow-hidden rounded-xl",
    "border p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
  ].join(" ");

  const cardStyle = {
    background: tile.wash,
    borderColor: tile.border,
    boxShadow: NL.shadowCard,
  };

  if (href) {
    return (
      <Link href={href} className={className} style={cardStyle}>
        <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accent }} aria-hidden />
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} style={cardStyle}>
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accent }} aria-hidden />
      {inner}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="relative flex min-h-[4.25rem] items-center gap-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-slate-200/80" />
      <div className="h-9 w-9 shrink-0 animate-skeleton rounded-lg bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-2.5 w-16 animate-skeleton rounded bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
        <div className="h-5 w-10 animate-skeleton rounded bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
        <div className="h-2 w-20 animate-skeleton rounded bg-gradient-to-r from-slate-200/80 via-slate-100 to-slate-200/80 bg-[length:200%_100%]" />
      </div>
    </div>
  );
}

/* ─── Panel (section card with header) ─── */

export function AdminPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`nl-panel overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: NL.borderCard }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: NL.brandPrimary }}>
            Overview
          </p>
          <h3 className="mt-0.5 text-[15px] font-bold" style={{ color: NL.textPrimary }}>{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px]" style={{ color: NL.textSecondary }}>{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ─── DataTable ─── */

export type DtFilter<K extends string = string> = {
  key: K;
  label: string;
  count?: number;
};

export function DataTable<K extends string>({
  title,
  totalCount,
  visibleCount,
  search,
  onSearch,
  searchPlaceholder = "Search…",
  searching = false,
  filters,
  activeFilter,
  onFilter,
  secondaryFilters,
  activeSecondary,
  onSecondary,
  toolbar,
  children,
  empty = "No records match your filters.",
  isEmpty = false,
}: {
  title: string;
  totalCount: number;
  visibleCount: number;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  searching?: boolean;
  filters?: DtFilter<K>[];
  activeFilter?: K;
  onFilter?: (k: K) => void;
  secondaryFilters?: DtFilter<string>[];
  activeSecondary?: string;
  onSecondary?: (k: string) => void;
  toolbar?: ReactNode;
  children: ReactNode;
  empty?: string;
  isEmpty?: boolean;
}) {
  return (
    <section className="nl-panel overflow-hidden">
      {/* ── Top toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-slate-500">
            {visibleCount}/{totalCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="h-8 w-52 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-8 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
              style={{ paddingLeft: "1.875rem" }}
            />
            {searching ? (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              </span>
            ) : search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearch("")}
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
          {toolbar}
        </div>
      </div>

      {/* ── Primary filter tabs ── */}
      {filters && onFilter && (
        <div className="flex items-center gap-0 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-5 scrollbar-none">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilter(f.key)}
              className={[
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors",
                activeFilter === f.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {f.label}
              {f.count !== undefined && (
                <span className={[
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold leading-none tabular-nums",
                  activeFilter === f.key
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-200 text-slate-500",
                ].join(" ")}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Secondary filter row (e.g. Priority) ── */}
      {secondaryFilters && onSecondary && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Filter:</span>
          {secondaryFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onSecondary(f.key)}
              className={[
                "nl-chip",
                activeSecondary === f.key ? "nl-chip-active" : "nl-chip-idle",
              ].join(" ")}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className="ml-1 opacity-75">({f.count})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Table area ── */}
      <div className="overflow-x-auto">
        {isEmpty ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-slate-400" aria-hidden>
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
                <path d="M21 21l-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">{empty}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function DtTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full min-w-[920px] border-collapse text-sm">{children}</table>
  );
}

export function DtHead({ cols }: { cols: { label: string; right?: boolean; center?: boolean }[] }) {
  return (
    <thead>
      <tr className="bg-slate-50/80">
        {cols.map((c, i) => (
          <th
            key={i}
            className={`border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${
              c.center ? "text-center" : c.right ? "text-right" : "text-left"
            } ${i === 0 ? "pl-5" : ""} ${i === cols.length - 1 ? "pr-5" : ""}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function DtRow({
  children,
  muted = false,
  id,
  className,
}: {
  children: ReactNode;
  muted?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <tr
      id={id}
      className={`group border-b border-slate-100/80 transition-colors last:border-0 ${muted ? "opacity-60" : "hover:bg-blue-50/30"} ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}

export function DtCell({
  children,
  first = false,
  last = false,
  right = false,
  center = false,
  nowrap = false,
  muted = false,
}: {
  children: ReactNode;
  first?: boolean;
  last?: boolean;
  right?: boolean;
  center?: boolean;
  nowrap?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={[
        "px-4 py-3.5 text-[13px]",
        first ? "pl-5" : "",
        last ? "pr-5" : "",
        center ? "text-center" : right ? "text-right" : "",
        nowrap ? "whitespace-nowrap" : "",
        muted ? "text-slate-400" : "text-slate-700",
        last && right ? "sticky right-0 z-[1] bg-white group-hover:bg-blue-50/30 shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)]" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

export function DtPagination({
  showing,
  total,
  page = 1,
  lastPage = 1,
  onPageChange,
  pageSize = ADMIN_TABLE_PAGE_SIZE,
}: {
  showing: number;
  total: number;
  page?: number;
  lastPage?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
}) {
  const items = buildPageItems(page, lastPage);
  const rangeStart = total === 0 || showing === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : rangeStart + showing - 1;
  const progress = lastPage > 1 ? (page / lastPage) * 100 : 100;
  const interactive = Boolean(onPageChange);

  return (
    <div
      className="relative overflow-hidden border-t border-slate-100/90 px-4 py-3.5 sm:px-5"
      style={{ background: "#FFFFFF" }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(27, 79, 138, 0.18), transparent)" }}
        aria-hidden
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm"
              style={{ background: NL.fillCta }}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
            <p className="text-[12.5px] leading-snug" style={{ color: NL.textSecondary }}>
              Viewing{" "}
              <span className="font-bold tabular-nums" style={{ color: NL.textPrimary }}>
                {rangeStart === 0 ? "0" : `${rangeStart}–${rangeEnd}`}
              </span>{" "}
              of{" "}
              <span className="font-bold tabular-nums" style={{ color: NL.textPrimary }}>
                {total}
              </span>{" "}
              records
            </p>
            <span
              className="hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex"
              style={{ borderColor: NL.borderInput, background: NL.chipBg, color: NL.brandPrimaryDeep }}
            >
              {pageSize} / page
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className="h-1.5 flex-1 max-w-[140px] overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={page}
              aria-valuemin={1}
              aria-valuemax={lastPage}
              aria-label={`Page ${page} of ${lastPage}`}
            >
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progress}%`,
                  background: NL.fillCta,
                  boxShadow: "0 0 10px rgba(27, 79, 138, 0.35)",
                }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: NL.textMuted }}>
              Page {page} of {Math.max(lastPage, 1)}
            </span>
          </div>
        </div>

        <nav
          className="inline-flex w-fit items-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-sm backdrop-blur-sm"
          aria-label="Pagination"
        >
          <PaginationIconBtn
            label="First page"
            disabled={!interactive || page <= 1}
            onClick={() => onPageChange?.(1)}
          >
            <ChevronsLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          </PaginationIconBtn>
          <PaginationIconBtn
            label="Previous page"
            disabled={!interactive || page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          </PaginationIconBtn>

          <div className="mx-0.5 flex items-center gap-0.5">
            {items.map((item, index) =>
              item === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="flex h-8 w-6 items-center justify-center text-[11px] font-bold tracking-widest text-slate-300"
                  aria-hidden
                >
                  ···
                </span>
              ) : (
                <PaginationPageBtn
                  key={item}
                  active={item === page}
                  disabled={!interactive}
                  onClick={() => onPageChange?.(item)}
                >
                  {item}
                </PaginationPageBtn>
              ),
            )}
          </div>

          <PaginationIconBtn
            label="Next page"
            disabled={!interactive || page >= lastPage}
            onClick={() => onPageChange?.(page + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </PaginationIconBtn>
          <PaginationIconBtn
            label="Last page"
            disabled={!interactive || page >= lastPage}
            onClick={() => onPageChange?.(lastPage)}
          >
            <ChevronsRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </PaginationIconBtn>
        </nav>
      </div>
    </div>
  );
}

function PaginationIconBtn({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-200",
        disabled
          ? "cursor-not-allowed opacity-35"
          : "hover:bg-[#E8F0F7] hover:text-[#1B4F8A] hover:shadow-sm active:scale-95",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PaginationPageBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-[12px] font-bold tabular-nums transition-all duration-200",
        active
          ? "text-white shadow-md"
          : disabled
            ? "cursor-default text-slate-400"
            : "text-slate-600 hover:bg-slate-50 hover:text-[#1B4F8A] active:scale-95",
      ].join(" ")}
      style={
        active
          ? {
              background: NL.fillCta,
              boxShadow: "0 4px 12px rgba(27, 79, 138, 0.28)",
            }
          : undefined
      }
    >
      {active ? (
        <span
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-white/30"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}

function buildPageItems(current: number, last: number): (number | "ellipsis")[] {
  if (last <= 1) return [1];
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis")[] = [1];

  if (current > 3) items.push("ellipsis");

  const start = Math.max(2, current - 1);
  const end = Math.min(last - 1, current + 1);
  for (let i = start; i <= end; i += 1) {
    if (!items.includes(i)) items.push(i);
  }

  if (current < last - 2) items.push("ellipsis");
  if (!items.includes(last)) items.push(last);

  return items;
}

/* ─── MetricCard — legacy compat ─── */

export function AdminMetricCard({
  label,
  value,
  hint,
  trend,
  tone = "blue",
}: {
  label: string;
  value: string;
  hint: string;
  trend?: string;
  tone?: Tone;
}) {
  return (
    <article className="nl-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {trend && <AdminBadge tone={tone}>{trend}</AdminBadge>}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </article>
  );
}
