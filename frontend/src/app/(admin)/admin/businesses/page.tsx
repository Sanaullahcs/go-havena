"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import { confirmAction, confirmDelete, toastSuccess, toastError } from "@/lib/alert";
import {
  fetchBusinesses,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  approveBusiness,
  rejectBusiness,
  reapproveBusiness,
  businessStatusLabel,
  type Business,
  type BusinessStats,
  type BusinessFormData,
} from "@/lib/api/businesses";
import { apiError } from "@/lib/api/client";
import { getUser } from "@/lib/auth/session";
import { PageLoader, PageError } from "@/components/shared/page-states";
import BusinessFormModal from "@/components/admin/business-form-modal";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

const EMPTY_STATS: BusinessStats = { total: 0, approved: 0, pending: 0, rejected: 0, inactive: 0 };

const STATUS_META: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  approved: { label: "Active",   tone: "green" },
  pending:  { label: "Pending",  tone: "amber" },
  rejected: { label: "Rejected", tone: "red"   },
  inactive: { label: "Inactive", tone: "slate" },
};

type SFilter = "all" | "approved" | "pending" | "rejected" | "inactive";

export default function BusinessesPage() {
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get("status") as SFilter | null) ?? "all";
  const [sFilter, setSFilter] = useState<SFilter>(
    ["all", "approved", "pending", "rejected", "inactive"].includes(initialStatus) ? initialStatus : "all",
  );
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [stats, setStats] = useState<BusinessStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUser = getUser();
  const myBusiness = businesses.find((b) => b.owner_id === currentUser?.id) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, per_page: ADMIN_TABLE_PAGE_SIZE };
      if (sFilter !== "all") params.status = sFilter;
      if (search) params.search = search;
      const res = await fetchBusinesses(params);
      setBusinesses(res.data ?? []);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      if (res.meta.stats) setStats(res.meta.stats);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [sFilter, search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [sFilter, search]);

  const statCards = [
    { label: "Total Businesses", value: String(stats.total),    hint: "All time",       tone: "cyan"  as const, icon: <IcoStore /> },
    { label: "Pending Review",   value: String(stats.pending),  hint: "Needs approval", tone: "amber" as const, icon: <IcoClock /> },
    { label: "Active",           value: String(stats.approved), hint: "Approved",       tone: "green" as const, icon: <IcoCheck /> },
    { label: "Rejected",         value: String(stats.rejected), hint: "Not approved",   tone: "red"   as const, icon: <IcoFlag /> },
  ];

  const countS = (s: SFilter): number => {
    switch (s) {
      case "all":      return stats.total;
      case "approved": return stats.approved;
      case "pending":  return stats.pending;
      case "rejected": return stats.rejected;
      case "inactive": return stats.inactive;
      default:         return 0;
    }
  };

  const statusFilters = (["all", "pending", "approved", "rejected"] as SFilter[]).map((s) => ({
    key: s, label: s === "all" ? "All" : businessStatusLabel(s), count: countS(s),
  }));

  const openCreate = () => {
    if (myBusiness) {
      openEdit(myBusiness);
      return;
    }
    setEditing(null);
    setModal(true);
  };

  const openEdit = (b: Business) => {
    if (b.owner_id !== currentUser?.id) {
      toastError("You can approve, reject, re-approve, or delete resident businesses. Only the owner can edit the profile.");
      return;
    }
    setEditing(b);
    setModal(true);
  };

  const canModerate = (b: Business) => b.owner_id !== currentUser?.id;
  const canEdit = (b: Business) => b.owner_id === currentUser?.id;
  const canDelete = (b: Business) => b.owner_id !== currentUser?.id;

  const handleSubmit = async (values: BusinessFormData) => {
    if (editing && editing.owner_id !== currentUser?.id) {
      toastError("Only the business owner can edit this profile.");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateBusiness(editing.id, values);
        toastSuccess("Business updated");
      } else {
        await createBusiness(values);
        toastSuccess("Business added and published");
      }
      setModal(false);
      setEditing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (b: Business) => {
    const isReapproval = b.status === "rejected";
    const result = await confirmAction({
      title: isReapproval ? `Re-approve ${b.name}?` : `Approve ${b.name}?`,
      text: isReapproval
        ? "This business will be visible again. Any disabled deals will be restored automatically."
        : "This business will appear in the marketplace.",
      confirmText: isReapproval ? "Re-approve" : "Approve",
      color: "green",
    });
    if (!result.isConfirmed) return;
    try {
      const res = isReapproval ? await reapproveBusiness(b.id) : await approveBusiness(b.id);
      const restored = res.meta?.deals_reactivated ?? 0;
      toastSuccess(
        restored > 0
          ? `${b.name} approved. ${restored} deal${restored === 1 ? "" : "s"} restored.`
          : `${b.name} approved`,
      );
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleReject = async (b: Business) => {
    const result = await confirmAction({
      title: `Reject ${b.name}?`,
      text: "This business will be hidden from the marketplace. Active deals will be set to inactive.",
      confirmText: "Reject",
      color: "red",
    });
    if (!result.isConfirmed) return;
    try {
      const res = await rejectBusiness(b.id);
      const disabled = res.meta?.deals_disabled ?? 0;
      toastSuccess(
        disabled > 0
          ? `${b.name} rejected. ${disabled} deal${disabled === 1 ? "" : "s"} disabled.`
          : `${b.name} rejected`,
      );
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleDelete = async (b: Business) => {
    const result = await confirmDelete({
      title: `Delete ${b.name}?`,
      text: "This cannot be undone.",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteBusiness(b.id);
      toastSuccess("Business deleted");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (loading) return <PageLoader skeleton />;
  if (error)   return <PageError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Commerce</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Businesses</h2>
          <p className="mt-1 text-sm text-slate-500">Moderate resident businesses — edit only your own profile.</p>
        </div>
        <button className="nl-btn-primary" onClick={openCreate}>
          {myBusiness ? <IcoEdit /> : <IcoPlus />}
          {myBusiness ? "Edit My Business" : "Add Business"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title="All Businesses"
        totalCount={total}
        visibleCount={businesses.length}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search name, category…"
        filters={statusFilters}
        activeFilter={sFilter}
        onFilter={(k) => setSFilter(k as SFilter)}
        isEmpty={businesses.length === 0}
        empty="No businesses match your filters."
      >
        <DtTable>
          <DtHead cols={[
            { label: "Business" },
            { label: "Category" },
            { label: "Owner" },
            { label: "Status" },
            { label: "", right: true },
          ]} />
          <tbody>
            {businesses.map((b) => {
              const st = STATUS_META[b.status] ?? STATUS_META.pending;
              const isMine = b.owner_id === currentUser?.id;
              return (
                <DtRow key={b.id}>
                  <DtCell first>
                    <div className="flex items-center gap-3">
                      {b.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
                          {b.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{b.name}</p>
                          {isMine ? (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              My Business
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-400">{b.address ?? "—"}</p>
                      </div>
                    </div>
                  </DtCell>
                  <DtCell nowrap muted>{b.category ?? "—"}</DtCell>
                  <DtCell nowrap muted>{b.owner_name ?? "—"}</DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={[
                        {
                          label: b.status === "rejected" ? "Re-approve" : "Approve",
                          icon: "approve",
                          tone: "success",
                          hidden: !(canModerate(b) && (b.status === "pending" || b.status === "rejected")),
                          onClick: () => handleApprove(b),
                        },
                        {
                          label: "Reject",
                          icon: "reject",
                          tone: "danger",
                          hidden: !(canModerate(b) && (b.status === "pending" || b.status === "approved")),
                          onClick: () => handleReject(b),
                        },
                        {
                          label: "Edit",
                          icon: "edit",
                          hidden: !canEdit(b),
                          onClick: () => openEdit(b),
                        },
                        {
                          label: "Delete",
                          icon: "delete",
                          tone: "danger",
                          hidden: !canDelete(b),
                          onClick: () => handleDelete(b),
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination showing={businesses.length} total={total} page={page} lastPage={lastPage} onPageChange={setPage} />
      </DataTable>

      <BusinessFormModal
        open={modal}
        mode={editing ? "edit" : "create"}
        initial={editing}
        submitting={submitting}
        onClose={() => { setModal(false); setEditing(null); }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function IcoPlus() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>; }
function IcoStore() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>; }
function IcoClock() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>; }
function IcoCheck() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>; }
function IcoFlag() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>; }
function IcoEdit() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
