"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, PenLine, Plus, Send, Users } from "lucide-react";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import {
  AGREEMENT_CATEGORIES,
  AGREEMENT_TEMPLATES,
  categoryLabel,
  createAgreement,
  deleteAgreement,
  duplicateAgreement,
  fetchAdminAgreements,
  sendAgreement,
  type Agreement,
  type AgreementForm,
} from "@/lib/api/agreements";
import { fetchMembers, type Member } from "@/lib/api/members";

const PAGE_SIZE = 6;
const emptyForm: AgreementForm = {
  title: "",
  category: "general",
  body: "",
  cover_message: "",
  audience: "all",
  user_ids: [],
  signature_fee_cents: 0,
  due_at: "",
  is_required: false,
};

function formatDate(value?: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminAgreementsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Agreement[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "sent" | "closed">("all");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AgreementForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [agreements, memberRes] = await Promise.all([
        fetchAdminAgreements({ status, search }),
        fetchMembers({ status: "approved", per_page: 100, role: "member" }).catch(() => null),
      ]);
      setRows(agreements.data);
      setStats(agreements.stats);
      if (memberRes?.data) {
        setMembers(memberRes.data.filter((m) => m.role === "member" || !m.role));
      }
      setPageError(null);
    } catch (err) {
      setPageError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const applyTemplate = (key: string) => {
    const tpl = AGREEMENT_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setForm((prev) => ({ ...prev, title: tpl.title, category: tpl.category, body: tpl.body }));
  };

  const submit = async (sendNow: boolean) => {
    if (form.title.trim().length < 3 || form.body.trim().length < 20) {
      toastError("Add a title and a complete agreement body.");
      return;
    }
    if (form.audience === "selected" && form.user_ids.length === 0) {
      toastError("Choose at least one resident, or send to everyone.");
      return;
    }
    setSubmitting(true);
    try {
      await createAgreement({ ...form, send: sendNow });
      toastSuccess(sendNow ? "Agreement sent for signature." : "Draft saved.");
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onSend = async (row: Agreement) => {
    try {
      await sendAgreement(row.id);
      toastSuccess("Sent to residents.");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const onDelete = async (row: Agreement) => {
    const ok = await confirmDelete({
      title: `Delete “${row.title}”?`,
      text: "Unsigned drafts can be removed. Signed records should stay in the community file.",
    });
    if (!ok.isConfirmed) return;
    try {
      await deleteAgreement(row.id);
      toastSuccess("Agreement deleted.");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (loading) return <PageLoader skeleton />;
  if (pageError && !rows.length) {
    return <PageError message={pageError} onRetry={() => { setPageError(null); setLoading(true); load(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Agreements</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Send living standards, waivers, and pet or parking forms. Residents sign with a paid digital signature certificate stored in the community file.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="nl-btn-primary">
          <Plus className="h-4 w-4" />
          New agreement
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Sent" value={String(stats.sent ?? 0)} hint="Out for signature" tone="blue" icon={<Send className="h-5 w-5" />} />
        <StatTile label="Awaiting" value={String(stats.awaiting ?? 0)} hint="Still unsigned" tone="amber" icon={<PenLine className="h-5 w-5" />} />
        <StatTile label="Signed" value={String(stats.signed ?? 0)} hint="Certificates issued" tone="green" icon={<FileSignature className="h-5 w-5" />} />
        <StatTile label="Drafts" value={String(stats.draft ?? 0)} hint="Not sent yet" tone="slate" icon={<Users className="h-5 w-5" />} />
      </div>

      <DataTable
        title="All agreements"
        totalCount={rows.length}
        visibleCount={paged.length}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search title or text…"
        filters={[
          { key: "all", label: "All" },
          { key: "draft", label: "Draft" },
          { key: "sent", label: "Sent" },
          { key: "closed", label: "Closed" },
        ]}
        activeFilter={status}
        onFilter={(key) => setStatus(key as typeof status)}
        isEmpty={paged.length === 0}
        empty={search || status !== "all" ? "No agreements match your filters." : "No agreements yet. Create one to collect digital signatures."}
      >
        <div className="space-y-3 p-4">
          {paged.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F0F7] text-[#1B4F8A]">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-[15px] font-semibold text-slate-900">{row.title}</h4>
                    <AdminBadge tone={row.status === "sent" ? "blue" : row.status === "closed" ? "slate" : "amber"}>
                      {row.status}
                    </AdminBadge>
                    {row.signature_fee_label ? (
                      <AdminBadge tone="violet">Fee {row.signature_fee_label}</AdminBadge>
                    ) : (
                      <AdminBadge tone="green">No fee</AdminBadge>
                    )}
                    {row.is_required ? <AdminBadge tone="violet">Required</AdminBadge> : null}
                    {row.is_overdue ? <AdminBadge tone="red">Overdue</AdminBadge> : row.is_due_soon ? <AdminBadge tone="amber">Due soon</AdminBadge> : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#1B4F8A]">{categoryLabel(row.category)}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {row.counts.signed}/{row.counts.total || 0} signed
                    {row.counts.pending > 0 ? ` · ${row.counts.pending} waiting` : ""}
                    {" · "}Due {formatDate(row.due_at)}
                  </p>
                </div>
                <AdminActionsMenu
                  actions={[
                    { label: "Open", icon: "view", onClick: () => router.push(`/admin/agreements/${row.id}`) },
                    { label: "Send now", icon: "plus", hidden: row.status !== "draft", onClick: () => onSend(row) },
                    {
                      label: "Duplicate",
                      icon: "plus",
                      onClick: async () => {
                        try {
                          const res = await duplicateAgreement(row.id);
                          toastSuccess(res.message);
                          router.push(`/admin/agreements/${res.data.id}`);
                        } catch (err) {
                          toastError(apiError(err));
                        }
                      },
                    },
                    { label: "Delete", icon: "delete", tone: "danger", onClick: () => onDelete(row) },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
        <DtPagination
          showing={paged.length}
          total={rows.length}
          page={page}
          lastPage={lastPage}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </DataTable>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-3 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="nl-eyebrow">Compose</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">New agreement</h2>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {AGREEMENT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => applyTemplate(tpl.key)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-[#1B4F8A] hover:text-[#1B4F8A]"
                >
                  {tpl.title}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Agreement title"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
                >
                  {AGREEMENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={form.due_at}
                  onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
                />
              </div>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={8}
                placeholder="Agreement text residents will review and sign…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#1B4F8A]"
              />
              <textarea
                value={form.cover_message}
                onChange={(e) => setForm({ ...form, cover_message: e.target.value })}
                rows={2}
                maxLength={500}
                placeholder="Optional cover note shown with the notification (e.g. why they need to sign)"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#1B4F8A]"
              />
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-slate-800">Required agreement</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Residents cannot decline. Use this for occupancy, safety, or policy acknowledgments.
                  </span>
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-600">
                  Signature fee (USD)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={(form.signature_fee_cents / 100).toString()}
                    onChange={(e) => setForm({
                      ...form,
                      signature_fee_cents: Math.round(Number(e.target.value || 0) * 100),
                    })}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  Recipients
                  <select
                    value={form.audience}
                    onChange={(e) => setForm({ ...form, audience: e.target.value as "all" | "selected" })}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
                  >
                    <option value="all">All approved residents</option>
                    <option value="selected">Selected residents</option>
                  </select>
                </label>
              </div>
              {form.audience === "selected" && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {members.map((m) => {
                    const checked = form.user_ids.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setForm({
                            ...form,
                            user_ids: checked
                              ? form.user_ids.filter((id) => id !== m.id)
                              : [...form.user_ids, m.id],
                          })}
                        />
                        <span className="font-medium text-slate-800">{m.display_name || m.name}</span>
                        {m.unit_number ? <span className="text-slate-400">· {m.unit_number}</span> : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(true)}
                className="nl-btn-primary"
              >
                <Send className="h-4 w-4" />
                Send for signature
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
