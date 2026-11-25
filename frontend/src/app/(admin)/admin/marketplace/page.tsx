"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import { confirmAction, confirmDelete, toastSuccess, toastError } from "@/lib/alert";
import {
  fetchListings, createListing, approveListing, rejectListing, deleteListing,
  type Listing, type ListingStats, type ListingFormData,
} from "@/lib/api/listings";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import MarketplaceFormModal from "@/components/admin/marketplace-form-modal";
import ListingViewModal from "@/components/admin/listing-view-modal";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending, shouldSkipStalePageFetch } from "@/lib/admin/table-loading";
import { formatCommunityMoney } from "@/lib/money";

const EMPTY_STATS: ListingStats = { total: 0, pending: 0, active: 0, rejected: 0, sold: 0 };

const STATUS_META: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  approved: { label: "Active",   tone: "green" },
  active:   { label: "Active",   tone: "green" },
  pending:  { label: "Pending",  tone: "amber" },
  rejected: { label: "Rejected", tone: "red"   },
  sold:     { label: "Sold",     tone: "slate" },
};

const TYPE_LABEL: Record<string, string> = {
  for_sale: "For Sale",
  service: "Service",
  deal: "Deal",
};

const CAT_COLOR: Record<string, string> = {
  services:    "#7c3aed",
  electronics: "#1B4F8A",
  furniture:   "#d97706",
  vehicles:    "#0891b2",
  food:        "#059669",
  other:       "#64748b",
  sale:        "#7c3aed",
  for_sale:    "#7c3aed",
  service:     "#0891b2",
  deal:        "#059669",
};

type SFilter = "all" | "active" | "pending" | "rejected" | "sold";

export default function MarketplacePage() {
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get("status") as SFilter | null) ?? "all";
  const [sFilter, setSFilter] = useState<SFilter>(
    ["all", "active", "pending", "rejected", "sold"].includes(initialStatus) ? initialStatus : "all",
  );
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [modal, setModal]     = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Listing | null>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [stats, setStats]       = useState<ListingStats>(EMPTY_STATS);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const hasLoadedOnce = useRef(false);
  const prevFilterKey = useRef(`${sFilter}|`);

  const runModeration = async (listingId: number, fn: () => Promise<void>) => {
    if (actionId !== null) return;
    setActionId(listingId);
    try {
      await fn();
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleApprove = async (listing: Listing) => {
    const isReapproval = listing.status === "rejected";
    const r = await confirmAction({
      title: isReapproval ? "Re-approve this listing?" : "Approve this listing?",
      text: isReapproval ? "It will go live in the marketplace again." : "It will go live immediately.",
      confirmText: isReapproval ? "Re-approve" : "Approve",
      color: "green",
    });
    if (!r.isConfirmed) return;
    await runModeration(listing.id, async () => {
      await approveListing(listing.id);
      toastSuccess(isReapproval ? "Listing re-approved and now live!" : "Listing approved and now live!");
    });
  };

  const handleReject = async (listing: Listing) => {
    const isUnpublish = listing.status === "approved" || listing.status === "active";
    const r = await confirmDelete({
      title: isUnpublish ? "Remove this listing from the marketplace?" : "Reject this listing?",
      text: isUnpublish
        ? "The listing will be hidden. You can re-approve it later."
        : "Seller will be notified.",
      confirmText: isUnpublish ? "Remove" : "Reject",
    });
    if (!r.isConfirmed) return;
    await runModeration(listing.id, async () => {
      await rejectListing(listing.id);
      toastSuccess(isUnpublish ? "Listing removed from marketplace." : "Listing rejected.");
    });
  };

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { admin: true, page, per_page: ADMIN_TABLE_PAGE_SIZE };
      if (sFilter !== "all") params.status = sFilter === "active" ? "approved" : sFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await fetchListings(params);
      setListings(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      if (res.meta.stats) setStats(res.meta.stats);
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [sFilter, debouncedSearch, page]);

  useEffect(() => {
    const filterKey = `${sFilter}|${debouncedSearch}`;
    if (shouldSkipStalePageFetch(filterKey, page, setPage, prevFilterKey)) return;
    void load();
  }, [sFilter, debouncedSearch, page, load]);

  const statCards = [
    { label: "Total Listings",  value: String(stats.total),    hint: "All time",       tone: "cyan"  as const, icon: <IcoMarket /> },
    { label: "Pending Review",  value: String(stats.pending),  hint: "Needs approval", tone: "amber" as const, icon: <IcoClock />  },
    { label: "Active Listings", value: String(stats.active),   hint: "Currently live", tone: "green" as const, icon: <IcoCheck />  },
    { label: "Rejected",        value: String(stats.rejected), hint: "Not approved",   tone: "red"   as const, icon: <IcoFlag />   },
  ];

  const countS = (s: SFilter): number => {
    switch (s) {
      case "all":      return stats.total;
      case "active":   return stats.active;
      case "pending":  return stats.pending;
      case "rejected": return stats.rejected;
      case "sold":     return stats.sold;
      default:         return 0;
    }
  };

  const visible = listings;

  const statusFilters = (["all","active","pending","rejected","sold"] as SFilter[]).map((s) => ({
    key: s, label: s.charAt(0).toUpperCase() + s.slice(1), count: countS(s),
  }));

  const handleCreate = async (values: ListingFormData) => {
    setCreating(true);
    try {
      const res = await createListing(values);
      setModal(false);
      toastSuccess(res?.data?.status === "approved" ? "Listing published and now live!" : "Listing added and pending review.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (error)   return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Commerce</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Marketplace</h2>
          <p className="mt-1 text-sm text-slate-500">Review, approve, and manage resident listings and community deals.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="nl-btn-secondary"><IcoDownload /> Export CSV</button>
          <button className="nl-btn-primary" onClick={() => setModal(true)}><IcoPlus /> Add Listing</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title="All Listings"
        totalCount={total}
        visibleCount={visible.length}
        search={searchInput}
        onSearch={setSearchInput}
        searching={isSearchPending}
        loading={adminTableBusy(refreshing, actionId !== null, creating)}
        searchPlaceholder="Search by title or seller…"
        filters={statusFilters}
        activeFilter={sFilter}
        onFilter={setSFilter}
        isEmpty={visible.length === 0}
        empty="No listings match your filters."
      >
        <DtTable>
          <DtHead cols={[
            { label: "Listing" },
            { label: "Seller" },
            { label: "Type" },
            { label: "Price" },
            { label: "Posted" },
            { label: "Status" },
            { label: "", right: true },
          ]} />
          <tbody>
            {visible.map((l) => {
              const st = STATUS_META[l.status] ?? STATUS_META.pending;
              const catColor = CAT_COLOR[l.type?.toLowerCase()] ?? "#64748b";
              const busy = actionId === l.id;
              return (
                <DtRow key={l.id} muted={l.status === "rejected" || l.status === "sold"}>
                  <DtCell first>
                    <p className="max-w-xs font-semibold text-slate-900 line-clamp-1">{l.title}</p>
                  </DtCell>
                  <DtCell nowrap muted>{l.seller_name}</DtCell>
                  <DtCell nowrap>
                    <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white capitalize" style={{ background: catColor }}>
                      {TYPE_LABEL[l.type] ?? l.type}
                    </span>
                  </DtCell>
                  <DtCell nowrap>
                    <span className="font-semibold text-slate-900">{l.price != null ? formatCommunityMoney(l.price) : "—"}</span>
                  </DtCell>
                  <DtCell nowrap muted>{new Date(l.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      disabled={busy}
                      actions={[
                        {
                          label: l.status === "rejected" ? "Re-approve" : "Approve",
                          icon: "approve",
                          tone: "success",
                          hidden: !(l.status === "pending" || l.status === "rejected"),
                          onClick: () => handleApprove(l),
                        },
                        {
                          label: l.status === "pending" ? "Reject" : "Remove from marketplace",
                          icon: "reject",
                          tone: "danger",
                          hidden: !(l.status === "pending" || l.status === "approved" || l.status === "active"),
                          onClick: () => handleReject(l),
                        },
                        { label: "View listing", icon: "view", onClick: () => setViewing(l) },
                        {
                          label: "Delete listing",
                          icon: "delete",
                          tone: "danger",
                          onClick: async () => {
                            const r = await confirmDelete({ title: "Delete this listing?", confirmText: "Delete" });
                            if (r.isConfirmed) {
                              try {
                                await deleteListing(l.id);
                                toastSuccess("Listing deleted.");
                                load();
                              } catch (err) {
                                toastError(apiError(err));
                              }
                            }
                          },
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination showing={visible.length} total={total} page={page} lastPage={lastPage} onPageChange={setPage} />
      </DataTable>

      <MarketplaceFormModal
        open={modal}
        mode="create"
        submitting={creating}
        onClose={() => setModal(false)}
        onSubmit={handleCreate}
      />

      <ListingViewModal listing={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function IcoMarket()   { return <svg viewBox="0 0 24 24" fill="none"><path d="M6 8h12l-1.2 11H7.2L6 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoClock()    { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoCheck()    { return <svg viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoFlag()     { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 21V4l1 1 3-2 3 2 3-2 3 2V15l-3-2-3 2-3-2-3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoPlus()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoDownload() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
