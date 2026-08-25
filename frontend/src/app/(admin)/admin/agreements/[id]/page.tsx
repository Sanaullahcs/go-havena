"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bell, Copy, Download, FileText, Send, ShieldCheck } from "lucide-react";
import { AdminBadge, StatTile } from "@/components/admin/ui";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError, EmptyState } from "@/components/shared/page-states";
import {
  AGREEMENT_CATEGORIES,
  categoryLabel,
  duplicateAgreement,
  exportRecipientsCsv,
  fetchAdminAgreement,
  remindAgreement,
  removeRecipient,
  reopenAgreement,
  reopenRecipient,
  sendAgreement,
  updateAgreement,
  withdrawAgreement,
  type Agreement,
  type AgreementForm,
  type RecipientStatus,
} from "@/lib/api/agreements";

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

const RECIPIENT_TONE: Record<RecipientStatus, "amber" | "blue" | "green" | "red"> = {
  pending: "amber",
  viewed: "blue",
  signed: "green",
  declined: "red",
};

type RecipientFilter = "all" | RecipientStatus;

const CATEGORY_OPTIONS = AGREEMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
const RECIPIENT_FILTER_OPTIONS = [
  { value: "all", label: "All recipients" },
  { value: "pending", label: "Pending" },
  { value: "viewed", label: "Viewed" },
  { value: "signed", label: "Signed" },
  { value: "declined", label: "Declined" },
];

export default function AdminAgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const [row, setRow] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AgreementForm | null>(null);
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>("all");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [dueDraft, setDueDraft] = useState("");
  const [notifyDue, setNotifyDue] = useState(true);

  const load = async () => {
    try {
      const data = await fetchAdminAgreement(id);
      setRow(data);
      setForm({
        title: data.title,
        category: data.category,
        body: data.body,
        cover_message: data.cover_message ?? "",
        audience: data.audience,
        user_ids: data.recipients?.map((r) => r.user_id) ?? [],
        signature_fee_cents: data.signature_fee_cents,
        due_at: toDateInput(data.due_at),
        is_required: Boolean(data.is_required),
      });
      setDueDraft(toDateInput(data.due_at));
      setError(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => {
    const total = row?.counts.total ?? 0;
    const signed = row?.counts.signed ?? 0;
    return total > 0 ? Math.round((signed / total) * 100) : 0;
  }, [row]);

  const people = useMemo(() => {
    const list = row?.recipients ?? [];
    const q = recipientSearch.trim().toLowerCase();
    return list.filter((person) => {
      if (recipientFilter !== "all" && person.status !== recipientFilter) return false;
      if (!q) return true;
      return [person.name, person.unit, person.certificate_id, person.signer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [row, recipientFilter, recipientSearch]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
    const ok = await confirmAction({
      title: "Send for signature?",
      text: "Approved residents will be notified and asked to apply a paid digital signature.",
      confirmText: "Send now",
    });
    if (!ok.isConfirmed) return;
    await run(async () => {
      const res = await sendAgreement(id);
      toastSuccess(res.message);
    });
  };

  const onIncludeNew = async () => {
    const ok = await confirmAction({
      title: "Include newly approved residents?",
      text: "Anyone approved since this was sent will be added. People who already signed stay on file. Only new recipients are notified.",
      confirmText: "Add new residents",
    });
    if (!ok.isConfirmed) return;
    await run(async () => {
      const res = await sendAgreement(id, { audience: "all" });
      toastSuccess(res.message);
    });
  };

  const onRemind = async () => {
    const ok = await confirmAction({
      title: "Remind unsigned residents?",
      text: "Everyone still waiting will get another notification to sign.",
      confirmText: "Send reminder",
    });
    if (!ok.isConfirmed) return;
    await run(async () => {
      const res = await remindAgreement(id);
      toastSuccess(res.message);
    });
  };

  const onClose = async () => {
    const ok = await confirmAction({
      title: "Close this agreement?",
      text: "Residents who have not signed will be notified and will no longer be able to complete it.",
      confirmText: "Close",
      color: "amber",
    });
    if (!ok.isConfirmed) return;
    await run(async () => {
      const res = await updateAgreement(id, { status: "closed" });
      toastSuccess(res.message);
    });
  };

  const onReopen = async () => {
    const ok = await confirmAction({
      title: "Reopen this agreement?",
      text: "Unsigned residents will be able to sign again and will be notified.",
      confirmText: "Reopen",
    });
    if (!ok.isConfirmed) return;
    await run(async () => {
      const res = await reopenAgreement(id);
      toastSuccess(res.message);
    });
  };

  const onWithdraw = async () => {
    const ok = await confirmAction({
      title: "Withdraw to draft?",
      text: "Residents will stop seeing this until you send it again. Use this only if nobody has signed yet.",
      confirmText: "Withdraw",
      color: "amber",
    });
    if (!ok.isConfirmed) return;
    await run(async () => {
      const res = await withdrawAgreement(id);
      toastSuccess(res.message);
    });
  };

  const onExtendDue = async () => {
    if (!dueDraft) {
      toastError("Choose a new due date.");
      return;
    }
    await run(async () => {
      const res = await updateAgreement(id, { due_at: dueDraft, notify_due_change: notifyDue });
      toastSuccess(res.message || "Due date updated.");
    });
  };

  const onDuplicate = async () => {
    await run(async () => {
      const res = await duplicateAgreement(id);
      toastSuccess(res.message);
      router.push(`/admin/agreements/${res.data.id}`);
    });
  };

  const onSaveDraft = async () => {
    if (!form) return;
    if (form.title.trim().length < 3 || form.body.trim().length < 20) {
      toastError("Add a title and a complete agreement body.");
      return;
    }
    await run(async () => {
      await updateAgreement(id, form);
      toastSuccess("Agreement updated.");
      setEditing(false);
    });
  };

  const copyCert = async (value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toastSuccess("Certificate ID copied.");
  };

  if (loading) return <PageLoader skeleton />;
  if (error || !row) {
    return <PageError message={error ?? "Agreement not found."} onRetry={() => { setLoading(true); load(); }} />;
  }

  const canEdit = Boolean(row.can_edit_content);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/agreements" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-[#1B4F8A]">
            <ArrowLeft className="h-4 w-4" />
            All agreements
          </Link>
          <p className="nl-eyebrow mt-3">Community file</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{row.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AdminBadge tone={row.status === "sent" ? "blue" : row.status === "closed" ? "slate" : "amber"}>
              {row.status}
            </AdminBadge>
            <AdminBadge tone="slate">{categoryLabel(row.category)}</AdminBadge>
            {row.signature_fee_label ? (
              <AdminBadge tone="violet">Certificate fee {row.signature_fee_label}</AdminBadge>
            ) : (
              <AdminBadge tone="green">No signature fee</AdminBadge>
            )}
            {row.is_required ? <AdminBadge tone="violet">Required</AdminBadge> : <AdminBadge tone="slate">Optional</AdminBadge>}
            {row.is_overdue ? <AdminBadge tone="red">Overdue</AdminBadge> : row.is_due_soon ? <AdminBadge tone="amber">Due soon</AdminBadge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.status === "draft" || (row.status === "sent" && canEdit) ? (
            <button type="button" disabled={busy} onClick={() => setEditing((v) => !v)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              {editing ? "Cancel edit" : row.status === "draft" ? "Edit draft" : "Edit before signatures"}
            </button>
          ) : null}
          {row.status === "draft" ? (
            <button type="button" disabled={busy} onClick={onSend} className="nl-btn-primary">
              <Send className="h-4 w-4" />
              Send for signature
            </button>
          ) : null}
          {row.status === "sent" ? (
            <>
              <button type="button" disabled={busy} onClick={onRemind} className="nl-btn-primary">
                <Bell className="h-4 w-4" />
                Remind unsigned
              </button>
              {row.audience === "all" ? (
                <button type="button" disabled={busy} onClick={onIncludeNew} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Include new residents
                </button>
              ) : null}
              {row.can_withdraw ? (
                <button type="button" disabled={busy} onClick={onWithdraw} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Withdraw to draft
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Close agreement
              </button>
            </>
          ) : null}
          {row.can_reopen ? (
            <button type="button" disabled={busy} onClick={onReopen} className="nl-btn-primary">
              Reopen for signatures
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !(row.recipients ?? []).length}
            onClick={() => exportRecipientsCsv(row)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button type="button" disabled={busy} onClick={onDuplicate} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Duplicate as draft
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Signed" value={`${row.counts.signed}/${row.counts.total || 0}`} hint={`${progress}% complete`} tone="green" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatTile label="Waiting" value={String(row.counts.pending)} hint={`${row.counts.declined} declined`} tone="amber" icon={<FileText className="h-5 w-5" />} />
        <StatTile label="Due" value={formatDate(row.due_at)} hint={row.sent_at ? `Sent ${formatDate(row.sent_at)}` : "Not sent"} tone={row.is_overdue ? "red" : row.is_due_soon ? "amber" : "blue"} />
      </div>

      {row.can_extend_due ? (
        <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <label className="text-sm text-slate-600">
            Extend due date
            <input
              type="date"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              className="mt-1 h-11 w-full min-w-[180px] rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
            />
          </label>
          <label className="mb-2.5 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={notifyDue} onChange={(e) => setNotifyDue(e.target.checked)} />
            Notify remaining signers
          </label>
          <button type="button" disabled={busy} onClick={onExtendDue} className="mb-0.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Save due date
          </button>
        </section>
      ) : null}

      {editing && form && canEdit ? (
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5">
          <p className="nl-eyebrow">Edit before sending</p>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
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
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#1B4F8A]"
          />
          <textarea
            value={form.cover_message}
            onChange={(e) => setForm({ ...form, cover_message: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="Optional cover note shown with the notification"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#1B4F8A]"
          />
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
              className="mt-0.5"
            />
            Required — residents cannot decline
          </label>
          <button type="button" disabled={busy} onClick={onSaveDraft} className="nl-btn-primary">
            Save changes
          </button>
        </section>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="h-2 bg-slate-100">
            <div className="h-full bg-[#1B4F8A] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <article className="px-5 py-5">
            {row.cover_message ? (
              <div className="mb-4 rounded-2xl bg-[#E8F0F7] px-4 py-3 text-sm text-[#1B4F8A]">
                {row.cover_message}
              </div>
            ) : null}
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Agreement text</p>
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{row.body}</p>
            {!canEdit ? (
              <p className="mt-4 text-xs text-slate-400">The wording is locked because at least one resident has signed. Duplicate it to send a revised version.</p>
            ) : null}
          </article>
        </div>
      )}

      <section className="nl-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-slate-900">Recipients & certificates</h3>
          <span className="text-xs font-semibold text-slate-400">{people.length} shown</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          {(["all", "pending", "viewed", "signed", "declined"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRecipientFilter(key)}
              className={[
                "rounded-full px-3 py-1 text-[12px] font-semibold",
                recipientFilter === key ? "bg-[#1B4F8A] text-white" : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              {key}
            </button>
          ))}
          <input
            value={recipientSearch}
            onChange={(e) => setRecipientSearch(e.target.value)}
            placeholder="Search resident or certificate…"
            className="ml-auto h-9 w-full max-w-xs rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1B4F8A]"
          />
        </div>
        {(row.recipients ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState title="No recipients yet." sub="Send this agreement to create the resident signing list." />
          </div>
        ) : people.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No residents match this filter." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {people.map((person) => (
              <div key={person.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8F0F7] text-sm font-bold text-[#1B4F8A]">
                  {(person.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{person.name}</p>
                    {person.unit ? <span className="text-xs text-slate-400">Unit {person.unit}</span> : null}
                    <AdminBadge tone={RECIPIENT_TONE[person.status]}>{person.status}</AdminBadge>
                  </div>
                  {person.status === "signed" ? (
                    <div className="mt-2 space-y-1 text-[12px] text-slate-500">
                      <p>Signed by <span className="font-semibold text-slate-700">{person.signer_name}</span> · {formatDate(person.signed_at, true)}</p>
                      {person.certificate_id ? (
                        <button type="button" onClick={() => copyCert(person.certificate_id)} className="inline-flex items-center gap-1 font-mono text-[11px] text-[#1B4F8A]">
                          <Copy className="h-3 w-3" />
                          {person.certificate_id}
                        </button>
                      ) : null}
                    </div>
                  ) : person.status === "declined" ? (
                    <p className="mt-1 text-xs text-rose-500">
                      Declined {formatDate(person.declined_at, true)}
                      {person.decline_reason ? ` · ${person.decline_reason}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      {person.viewed_at ? `Opened ${formatDate(person.viewed_at, true)}` : "Not opened yet"}
                    </p>
                  )}
                </div>
                {person.signature_url ? (
                  <img
                    src={person.signature_url}
                    alt={`${person.name} signature`}
                    className="h-12 w-28 rounded-lg border border-slate-200 bg-[#FBFCFD] object-contain"
                  />
                ) : null}
                {row.status === "sent" ? (
                  <div className="flex flex-wrap gap-2">
                    {person.can_remind ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await confirmAction({
                            title: `Remind ${person.name}?`,
                            text: "They will get another notification to review and sign this agreement.",
                            confirmText: "Send reminder",
                          });
                          if (!ok.isConfirmed) return;
                          await run(async () => {
                            const res = await remindAgreement(id, [person.user_id]);
                            toastSuccess(res.message);
                          });
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Remind
                      </button>
                    ) : null}
                    {person.can_reopen ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await confirmAction({
                            title: `Invite ${person.name} to sign again?`,
                            text: "Their previous decline will be cleared and they will be notified.",
                            confirmText: "Invite again",
                          });
                          if (!ok.isConfirmed) return;
                          await run(async () => {
                            const res = await reopenRecipient(id, person.user_id);
                            toastSuccess(res.message);
                          });
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-[#1B4F8A] hover:bg-[#E8F0F7]"
                      >
                        Invite again
                      </button>
                    ) : null}
                    {person.can_remove ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await confirmAction({
                            title: `Remove ${person.name}?`,
                            text: "They will no longer see this agreement. Signed certificates cannot be removed.",
                            confirmText: "Remove",
                            color: "amber",
                          });
                          if (!ok.isConfirmed) return;
                          await run(async () => {
                            const res = await removeRecipient(id, person.user_id);
                            toastSuccess(res.message);
                          });
                        }}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
