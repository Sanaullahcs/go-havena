"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus, Send, Users } from "lucide-react";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { confirmAction, confirmDelete, toastError, toastSuccess } from "@/lib/alert";
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

const CATEGORY_OPTIONS = AGREEMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
const AUDIENCE_OPTIONS = [
  { value: "all", label: "All approved residents", description: "Everyone currently approved in the community" },
  { value: "selected", label: "Selected residents", description: "Search and pick specific people" },
];
const TEMPLATE_OPTIONS = [
  { value: "", label: "Blank agreement", description: "Start from scratch" },
  ...AGREEMENT_TEMPLATES.map((tpl) => ({
    value: tpl.key,
    label: tpl.title,
    description: categoryLabel(tpl.category),
  })),
];
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
  const [chargeFee, setChargeFee] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [memberQuery, setMemberQuery] = useState("");

  const load = async () => {
    try {
      const [agreements, memberRes] = await Promise.all([
        fetchAdminAgreements({ status, search }),
        fetchMembers({ status: "approved", per_page: 100, role: "member" }).catch(() => null),
      ]);
      setRows(Array.isArray(agreements.data) ? agreements.data : []);
      setStats(agreements.stats ?? {});
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

  const list = Array.isArray(rows) ? rows : [];
  const lastPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const tpl = AGREEMENT_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setForm((prev) => ({ ...prev, title: tpl.title, category: tpl.category, body: tpl.body }));
  };

  const visibleMembers = members.filter((m) => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return true;
    return [m.display_name, m.name, m.unit_number].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  });

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
      await createAgreement({
        ...form,
        signature_fee_cents: chargeFee ? form.signature_fee_cents : 0,
        send: sendNow,
      });
      toastSuccess(sendNow ? "Agreement sent for signature." : "Draft saved.");
      setShowForm(false);
      setForm(emptyForm);
      setChargeFee(false);
      setTemplateKey("");
      setMemberQuery("");
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onSend = async (row: Agreement) => {
    const ok = await confirmAction({
      title: `Send “${row.title}”?`,
      text: "Approved residents will be notified and asked to review and sign.",
      confirmText: "Send now",
    });
    if (!ok.isConfirmed) return;
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
  if (pageError && !list.length) {
    return <PageError message={pageError} onRetry={() => { setPageError(null); setLoading(true); load(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Agreements</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Send living standards, waivers, and pet or parking forms. Residents review and apply a digital signature stored in the community file. Signing is free unless you add an optional certificate fee.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="nl-btn-primary">
          <Plus className="h-4 w-4" />
          New agreement
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Sent" value={String(stats.sent ?? 0)} hint="Out for signature" tone="blue" icon={<Send className="h-5 w-5" />} />
        <StatTile label="Awaiting" value={String(stats.awaiting ?? 0)} hint="Still unsigned" tone="amber" icon={<Pencil className="h-5 w-5" />} />
        <StatTile label="Signed" value={String(stats.signed ?? 0)} hint="Certificates issued" tone="green" icon={<FileText className="h-5 w-5" />} />
        <StatTile label="Drafts" value={String(stats.draft ?? 0)} hint="Not sent yet" tone="slate" icon={<Users className="h-5 w-5" />} />
      </div>

      <DataTable
        title="All agreements"
        totalCount={list.length}
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
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-[15px] font-semibold text-slate-900">{row.title}</h4>
                    <AdminBadge tone={row.status === "sent" ? "blue" : row.status === "closed" ? "slate" : "amber"}>
                      {row.status}
                    </AdminBadge>
                    {row.signature_fee_label ? (
                      <AdminBadge tone="violet">Fee {row.signature_fee_label}</AdminBadge>
                    ) : null}
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
          total={list.length}
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

            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Start from a template
                <SearchableSelect
                  className="mt-1.5"
                  searchable
                  value={templateKey}
                  onChange={applyTemplate}
                  options={TEMPLATE_OPTIONS}
                  placeholder="Search templates…"
                  searchPlaceholder="Search templates…"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Title
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Agreement title"
                  className="nl-input mt-1.5 h-11 w-full"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Category
                  <SearchableSelect
                    className="mt-1.5"
                    searchable
                    value={form.category}
                    onChange={(category) => setForm({ ...form, category })}
                    options={CATEGORY_OPTIONS}
                    placeholder="Search categories…"
                    searchPlaceholder="Search categories…"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Due date
                  <input
                    type="date"
                    value={form.due_at}
                    onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                    className="nl-input mt-1.5 h-11 w-full"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Agreement text
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  placeholder="Agreement text residents will review and sign…"
                  className="nl-input mt-1.5 w-full py-2.5 leading-6"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Cover note <span className="font-normal text-slate-400">(optional)</span>
                <textarea
                  value={form.cover_message}
                  onChange={(e) => setForm({ ...form, cover_message: e.target.value })}
                  rows={2}
                  maxLength={500}
                  placeholder="Shown with the notification, e.g. why they need to sign"
                  className="nl-input mt-1.5 w-full py-2.5 leading-6"
                />
              </label>
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
              <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={chargeFee}
                    onChange={(e) => {
                      setChargeFee(e.target.checked);
                      if (!e.target.checked) setForm({ ...form, signature_fee_cents: 0 });
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold text-slate-800">Charge a certificate fee</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Signing is free by default. Turn this on only if this document should collect a processing fee before the signature is recorded.
                    </span>
                  </span>
                </label>
                {chargeFee ? (
                  <label className="mt-3 block text-sm font-medium text-slate-700">
                    Amount (USD)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={(form.signature_fee_cents / 100).toString()}
                      onChange={(e) => setForm({
                        ...form,
                        signature_fee_cents: Math.round(Number(e.target.value || 0) * 100),
                      })}
                      className="nl-input mt-1.5 h-11 w-full"
                    />
                  </label>
                ) : null}
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Recipients
                <SearchableSelect
                  className="mt-1.5"
                  searchable
                  value={form.audience}
                  onChange={(audience) => setForm({ ...form, audience: audience as "all" | "selected", user_ids: audience === "all" ? [] : form.user_ids })}
                  options={AUDIENCE_OPTIONS}
                  placeholder="Choose who should sign…"
                  searchPlaceholder="Search recipient options…"
                />
              </label>
              {form.audience === "selected" && (
                <div className="rounded-xl border border-slate-200">
                  <input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Search residents by name or unit…"
                    className="nl-input h-11 w-full rounded-none rounded-t-xl border-0 border-b border-slate-200"
                  />
                  <div className="max-h-44 overflow-y-auto p-2">
                    {visibleMembers.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-slate-400">No residents match that search.</p>
                    ) : visibleMembers.map((m) => {
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
                  {form.user_ids.length > 0 ? (
                    <p className="border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                      {form.user_ids.length} selected
                    </p>
                  ) : null}
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
