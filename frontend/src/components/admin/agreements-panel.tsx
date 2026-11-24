"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isAdminSearchPending } from "@/lib/admin/table-loading";
import { createPortal } from "react-dom";
import { AlarmClock, ArrowLeft, ArrowRight, Bell, Building2, Check, CheckCircle2, ClipboardCheck, Clock, Download, FileText, Files, Home, PenLine, RotateCcw, Search, SlidersHorizontal, Upload, UserRound, Users, X } from "lucide-react";
import { CharCount } from "@/components/admin/char-count";
import { AdminActionsMenu, type AdminMenuAction } from "@/components/admin/admin-actions-menu";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { confirmAction, confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { validateAgreementDetails } from "@/lib/admin/agreement-form-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { apiError } from "@/lib/api/client";
import { deleteDocument, fetchAdminDocuments } from "@/lib/api/documents";
import {
  DOCUMENT_OTHER_CATEGORY,
  DOCUMENT_PRESET_CATEGORIES,
  buildDocumentCategoryOptions,
  isDocumentOtherCategory,
  resolveDocumentCategory,
  splitDocumentCategory,
} from "@/lib/admin/document-categories";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  archiveAgreement,
  createAgreementDraft,
  createAgreementVersion,
  updateAgreementDraft,
  downloadAgreementExport,
  fetchAgreement,
  fetchAgreementOptions,
  fetchAgreements,
  publishAgreement,
  remindAgreement,
  revokeAgreement,
  type AgreementCounts,
  type AgreementDetail,
  type AgreementRecipient,
  type AgreementSummary,
  type RecipientOption,
  type UnitOption,
} from "@/lib/api/agreements";

type Scope = "all" | "residents" | "units";

const STATUS_TONE = {
  draft: "slate",
  published: "green",
  archived: "slate",
  revoked: "red",
  superseded: "amber",
} as const;

function formatWhen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function agreementStatusLabel(status: string) {
  if (status === "published") return "";
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  if (status === "revoked") return "Revoked";
  if (status === "superseded") return "Superseded";
  return status;
}

function agreementListBadge(row: AgreementSummary): { label: string; tone: "green" | "amber" | "red" | "slate" } {
  if (row.publication_status === "draft") return { label: "Draft", tone: "slate" };
  if (row.publication_status === "archived") return { label: "Archived", tone: "slate" };
  if (row.publication_status === "revoked") return { label: "Revoked", tone: "red" };
  const stats = row.stats;
  const recipients = stats?.recipients ?? 0;
  const signed = stats?.signed ?? 0;
  if ((stats?.overdue ?? 0) > 0) return { label: "Overdue", tone: "amber" };
  if (recipients > 0 && signed >= recipients) return { label: "Signed", tone: "green" };
  if ((stats?.expired ?? 0) > 0) return { label: "Expired", tone: "red" };
  if (row.publication_status === "published") return { label: "Waiting", tone: "amber" };
  return { label: agreementStatusLabel(row.publication_status) || "Draft", tone: "slate" };
}

function recipientStatusLabel(status: string) {
  if (status === "pending" || status === "viewed") return "Pending";
  if (status === "overdue") return "Overdue";
  if (status === "signed") return "Signed";
  if (status === "expired") return "Expired";
  if (status === "declined") return "Declined";
  if (status === "revoked") return "Revoked";
  return status;
}

function dateInput(value: string | null | undefined) {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function latestDate(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

function formatAgreementDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || "Not set";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_COUNTS: AgreementCounts = {
  all: 0,
  draft: 0,
  published: 0,
  archived: 0,
  revoked: 0,
  superseded: 0,
  overdue: 0,
  expired: 0,
  pending: 0,
  signed: 0,
};

function fileSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function AgreementsPanel({
  initialId = null,
  openCreateRef,
}: {
  initialId?: number | null;
  openCreateRef?: { current: (() => void) | null };
}) {
  const [rows, setRows] = useState<AgreementSummary[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, counts: EMPTY_COUNTS });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [personInput, setPersonInput] = useState("");
  const [unitInput, setUnitInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const debouncedPerson = useDebouncedValue(personInput, 400);
  const debouncedUnit = useDebouncedValue(unitInput, 400);
  const search = debouncedSearch.trim();
  const person = debouncedPerson.trim();
  const unit = debouncedUnit.trim();
  const isSearchPending =
    isAdminSearchPending(searchInput, debouncedSearch) ||
    isAdminSearchPending(personInput, debouncedPerson) ||
    isAdminSearchPending(unitInput, debouncedUnit);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wizardDraft, setWizardDraft] = useState<AgreementDetail | null>(null);
  const [wizardIntent, setWizardIntent] = useState<"create" | "edit" | "publish">("create");
  const [detail, setDetail] = useState<AgreementDetail | null>(null);
  const [info, setInfo] = useState<AgreementDetail | null>(null);
  const [versionSource, setVersionSource] = useState<AgreementSummary | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [pdfViewer, setPdfViewer] = useState<{ title: string; url: string } | null>(null);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await fetchAgreements({
        status,
        search,
        resident: person,
        unit,
        category,
        page: nextPage,
      });
      setRows(res.data);
      setMeta(res.meta);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, person, unit, category, status]);

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search, category, person, unit]);

  useEffect(() => {
    if (!initialId) return;
    void openDetail(initialId);
  }, [initialId]);

  const openDetail = async (id: number) => {
    try {
      setDetail(await fetchAgreement(id));
      setCreating(false);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const openInfo = async (id: number) => {
    try {
      setInfo(await fetchAgreement(id));
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const refreshOpen = async (id: number) => {
    await load(page);
    if (detail?.id === id) {
      try {
        setDetail(await fetchAgreement(id));
      } catch {
        setDetail(null);
      }
    }
    if (info?.id === id) {
      try {
        setInfo(await fetchAgreement(id));
      } catch {
        setInfo(null);
      }
    }
  };

  const handleRemind = async (row: AgreementSummary) => {
    try {
      const result = await remindAgreement(row.id);
      if (result.sent > 0) {
        toastSuccess(result.sent === 1 ? "Reminder sent." : `Reminders sent: ${result.sent}`);
      } else {
        toastError("No eligible residents to remind.");
      }
      await refreshOpen(row.id);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleArchive = async (row: AgreementSummary) => {
    const ok = await confirmAction({
      title: "Archive Agreement?",
      text: "Are you sure you want to archive this agreement? It will be removed from residents' view.",
      confirmText: "Archive",
      icon: "warning",
      color: "amber",
    });
    if (!ok.isConfirmed) return;
    try {
      await archiveAgreement(row.id);
      toastSuccess("Agreement archived");
      await refreshOpen(row.id);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleDelete = async (row: AgreementSummary) => {
    const ok = await confirmDelete({
      title: "Delete Agreement?",
      text: "Are you sure you want to delete this agreement? It will be permanently removed and cannot be restored.",
    });
    if (!ok.isConfirmed) return;
    try {
      await deleteDocument(row.id);
      toastSuccess("Agreement deleted");
      if (detail?.id === row.id) setDetail(null);
      if (info?.id === row.id) setInfo(null);
      await load(page);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const openDraftWizard = async (id: number, intent: "edit" | "publish") => {
    try {
      setWizardIntent(intent);
      setWizardDraft(await fetchAgreement(id));
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const openCreate = () => {
    setDetail(null);
    setWizardIntent("create");
    setCreating(true);
  };
  if (openCreateRef) openCreateRef.current = openCreate;

  const rowActions = (row: AgreementSummary): AdminMenuAction[] => {
    const status = row.publication_status;
    const outstanding = (row.stats?.pending ?? 0) + (row.stats?.overdue ?? 0);
    return [
      {
        id: "details",
        label: "View Details",
        icon: "view",
        onClick: () => void openInfo(row.id),
      },
      {
        id: "pdf",
        label: "View PDF",
        icon: "download",
        hidden: !row.file_url,
        onClick: () => row.file_url && setPdfViewer({ title: row.title, url: row.file_url }),
      },
      {
        id: "tracking",
        label: "Signature Tracking",
        icon: "check",
        onClick: () => void openDetail(row.id),
      },
      {
        id: "edit",
        label: "Edit draft",
        icon: "edit",
        hidden: status !== "draft",
        onClick: () => void openDraftWizard(row.id, "edit"),
      },
      {
        id: "publish",
        label: "Save",
        icon: "check",
        hidden: status !== "draft",
        onClick: () => void openDraftWizard(row.id, "publish"),
      },
      {
        id: "remind",
        label: "Send Reminder",
        icon: "escalate",
        hidden: status !== "published" || outstanding === 0,
        onClick: () => void handleRemind(row),
      },
      {
        id: "version",
        label: "Create New Version",
        icon: "plus",
        hidden: status === "draft",
        onClick: () => setVersionSource(row),
      },
      {
        id: "export",
        label: "Export",
        icon: "download",
        onClick: () => downloadAgreementExport(row.id).catch((err) => toastError(apiError(err))),
      },
      {
        id: "archive",
        label: "Archive Agreement",
        icon: "ban",
        tone: "warning",
        hidden: status !== "published",
        onClick: () => void handleArchive(row),
      },
      {
        id: "revoke",
        label: "Revoke",
        icon: "ban",
        tone: "danger",
        hidden: status !== "published" && status !== "archived",
        onClick: async () => {
          try {
            await revokeAgreement(row.id);
            toastSuccess("Agreement revoked");
            await refreshOpen(row.id);
          } catch (err) {
            toastError(apiError(err));
          }
        },
      },
      {
        id: "delete",
        label: "Delete Agreement",
        icon: "delete",
        tone: "danger",
        hidden: status !== "draft",
        onClick: () => void handleDelete(row),
      },
    ];
  };

  const counts = meta.counts ?? EMPTY_COUNTS;

  const clearRecipientSearch = () => {
    setSearchInput("");
    setPersonInput("");
    setUnitInput("");
    setPage(1);
  };

  const filtersActive = Boolean(search || person || unit);

  const filters = [
    { key: "all", label: "All", count: counts.all, icon: <Files strokeWidth={2.25} /> },
    { key: "draft", label: "Drafts", count: counts.draft, icon: <PenLine strokeWidth={2.25} /> },
    { key: "signed", label: "Signed", count: counts.signed, icon: <CheckCircle2 strokeWidth={2.25} /> },
    { key: "overdue", label: "Overdue", count: counts.overdue, icon: <AlarmClock strokeWidth={2.25} /> },
  ];

  return (
    <div className="space-y-4">
      <section
        className="overflow-hidden rounded-2xl border border-[color:var(--brand-border)] bg-gradient-to-r from-white via-[var(--mint)]/40 to-[var(--canvas)] p-4 shadow-sm"
        aria-label="Search agreements"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--deep-teal)] shadow-sm ring-1 ring-[var(--mint)]">
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Search agreements</p>
              <p className="text-xs text-slate-500">Matches title, resident name, email, or unit number — updates as you type</p>
            </div>
          </div>
          {filtersActive || isSearchPending ? (
            <button type="button" onClick={clearRecipientSearch} className="nl-btn-secondary h-9 px-3 text-xs">
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FileText className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} />
              Agreement
            </span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Title, category, or description"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-[var(--mint)] placeholder:text-slate-400 focus:border-[var(--teal)] focus:ring-2"
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <UserRound className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} />
              Resident name or email
            </span>
            <input
              value={personInput}
              onChange={(event) => setPersonInput(event.target.value)}
              placeholder="e.g. Syed or syed@gohavena.com"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-[var(--mint)] placeholder:text-slate-400 focus:border-[var(--teal)] focus:ring-2"
            />
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Building2 className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} />
              Unit number
            </span>
            <input
              value={unitInput}
              onChange={(event) => setUnitInput(event.target.value)}
              placeholder="e.g. A-101"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-[var(--mint)] placeholder:text-slate-400 focus:border-[var(--teal)] focus:ring-2"
            />
          </label>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Agreements" value={String(counts.all)} hint="Everything in this community" tone="blue" icon={<FileText className="h-5 w-5" />} />
        <StatTile label="Waiting" value={String(counts.pending ?? 0)} hint="Still need a signature" tone="amber" icon={<Clock className="h-5 w-5" />} />
        <StatTile label="Signed" value={String(counts.signed ?? 0)} hint="Everyone has signed" tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>
      {creating || wizardDraft ? (
        <AgreementWizard
          key={wizardDraft?.id ?? "new"}
          draft={wizardDraft}
          intent={wizardDraft ? wizardIntent : "create"}
          onClose={() => {
            const id = wizardDraft?.id ?? null;
            setCreating(false);
            setWizardDraft(null);
            void (async () => {
              await load(page);
              if (id) await openDetail(id);
            })();
          }}
          onPublished={async (id) => {
            setCreating(false);
            setWizardDraft(null);
            setPage(1);
            await load(1);
            await openDetail(id);
          }}
        />
      ) : null}

      {info ? <AgreementInfoDialog detail={info} onClose={() => setInfo(null)} /> : null}
      {pdfViewer ? <AgreementPdfDialog title={pdfViewer.title} url={pdfViewer.url} onClose={() => setPdfViewer(null)} /> : null}

      {versionSource ? (
        <AgreementVersionDialog
          source={versionSource}
          onClose={() => setVersionSource(null)}
          onCreated={async (draft) => {
            setVersionSource(null);
            toastSuccess(`Version ${draft.version} saved as a draft. Save it to assign recipients.`);
            await load(1);
            setPage(1);
            await openDraftWizard(draft.id, "edit");
          }}
        />
      ) : null}

      {detail ? (
        <AgreementDetailView
          detail={detail}
          recipientQuery={recipientQuery}
          onRecipientQuery={setRecipientQuery}
          onClose={() => setDetail(null)}
          onViewPdf={(url, title) => setPdfViewer({ url, title })}
          onChange={async () => {
            await load(page);
            await openDetail(detail.id);
          }}
        />
      ) : null}

      <DataTable
        title="Agreements"
        search=""
        onSearch={() => undefined}
        searchSlot={
          <p className="hidden text-[12px] text-slate-500 sm:block">
            {filtersActive ? "Filtered list" : "Use the search panel above to narrow by agreement, resident, or unit"}
          </p>
        }
        beforeSearch={
          <div className="w-52 shrink-0">
            <ThemedSelect
              value={category}
              placeholder="All categories"
              options={[
                { value: "all", label: "All categories" },
                ...DOCUMENT_PRESET_CATEGORIES.map((name) => ({ value: name, label: name })),
                { value: DOCUMENT_OTHER_CATEGORY, label: DOCUMENT_OTHER_CATEGORY },
              ]}
              onChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
            />
          </div>
        }
        loading={loading}
        searching={isSearchPending}
        filters={filters}
        activeFilter={status}
        onFilter={(key) => {
          setStatus(key);
          setPage(1);
        }}
        isEmpty={!loading && rows.length === 0}
        empty={search || person || unit || category !== "all" ? "No agreements match your filters." : "No agreements yet."}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Agreement</th>
                <th className="px-4 py-3 font-semibold">Audience / Units</th>
                <th className="px-4 py-3 font-semibold">Signatures</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const recipients = row.stats?.recipients ?? 0;
                const signed = row.stats?.signed ?? 0;
                const progress = recipients > 0 ? Math.min(100, Math.round((signed / recipients) * 100)) : 0;
                const badge = agreementListBadge(row);
                return (
                <tr key={row.id} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50" onClick={() => void openDetail(row.id)}>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F0F7] text-[#1B4F8A] ring-1 ring-[#D3E2F0]" aria-hidden>
                        <PenLine className="h-4 w-4" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{row.title}</div>
                        <div className="text-xs text-slate-400">{[row.category, `Version ${row.version}`].filter(Boolean).join(" · ")}</div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 text-slate-600">
                    <p className="text-sm font-medium text-slate-700">{row.audience_label || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">{recipients === 0 ? "Not assigned" : `${signed} of ${recipients} signed`}</p>
                    {recipients > 0 ? (
                      <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#0F766E]" style={{ width: `${progress}%` }} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatWhen(row.due_at)}</td>
                  <td className="px-4 py-3">
                    <AdminBadge tone={badge.tone}>
                      {badge.label === "Signed" ? <CheckCircle2 className="mr-1 h-3 w-3" strokeWidth={2.25} aria-hidden /> : badge.label === "Waiting" || badge.label === "Overdue" ? <Clock className="mr-1 h-3 w-3" strokeWidth={2.25} aria-hidden /> : <PenLine className="mr-1 h-3 w-3" strokeWidth={2.25} aria-hidden />}
                      {badge.label}
                    </AdminBadge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <AdminActionsMenu actions={rowActions(row)} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataTable>
      <DtPagination showing={rows.length} total={meta.total} page={meta.current_page} lastPage={meta.last_page} pageSize={20} onPageChange={setPage} />
    </div>
  );
}

const AGREEMENT_STEPS = [
  { id: 1, label: "Details", icon: FileText },
  { id: 2, label: "Assign Residents", icon: Users },
  { id: 3, label: "Review & Save", icon: ClipboardCheck },
] as const;

const EMPTY_AGREEMENT_FORM = JSON.stringify({
  title: "",
  description: "",
  category: "",
  dueAt: "",
  effectiveAt: "",
  expiresAt: "",
  fileKey: "",
  scope: "all",
  users: "",
  units: "",
  notify: true,
});

function downloadHref(url: string) {
  if (!url.includes("/signed-files/")) return url;
  return url.includes("download=") ? url : `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

type PdfJsDocument = {
  numPages: number;
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
  destroy?: () => void;
};

function loadPdfJs(): Promise<{ getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> } }> {
  const win = window as Window & { pdfjsLib?: { getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> }; GlobalWorkerOptions: { workerSrc: string } } };
  if (win.pdfjsLib) {
    win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(win.pdfjsLib);
  }
  const pending = (loadPdfJs as { pending?: Promise<NonNullable<typeof win.pdfjsLib>> }).pending;
  if (pending) return pending;
  const next = new Promise<NonNullable<typeof win.pdfjsLib>>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDFJS_SRC;
    script.async = true;
    script.onload = () => {
      if (!win.pdfjsLib) {
        reject(new Error("pdf"));
        return;
      }
      win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(win.pdfjsLib);
    };
    script.onerror = () => reject(new Error("pdf"));
    document.head.appendChild(script);
  });
  (loadPdfJs as { pending?: Promise<NonNullable<typeof win.pdfjsLib>> }).pending = next;
  return next;
}

function PdfPreview({ url, title, tall = false }: { url: string; title: string; tall?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfJsDocument | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    setPage(1);
    setTotal(0);
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("pdf");
        const data = await response.arrayBuffer();
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          doc.destroy?.();
          return;
        }
        docRef.current = doc;
        setTotal(doc.numPages);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!doc || !canvas || !stage || !ready) return;
    let cancelled = false;
    void (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const width = Math.max(240, stage.clientWidth - 32);
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: (width / unscaled.width) * ratio });
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [page, ready]);

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${tall ? "h-full" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
        <p className="min-w-0 truncate text-xs font-semibold text-slate-600" title={title}>{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Previous page" disabled={!ready || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
          <span className="min-w-[4.5rem] text-center text-[11px] font-semibold tabular-nums text-slate-500">{ready ? `${page} of ${total}` : "Opening"}</span>
          <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Next page" disabled={!ready || page >= total} onClick={() => setPage((current) => current + 1)}>
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <div ref={stageRef} className={`overflow-auto px-4 py-4 ${tall ? "min-h-0 flex-1" : "max-h-80"}`}>
        {failed ? <p className="py-10 text-center text-sm text-slate-500">This PDF could not be shown here.</p> : null}
        {!failed && !ready ? <div className="mx-auto h-64 max-w-md animate-pulse rounded-sm bg-white shadow-sm" /> : null}
        <canvas ref={canvasRef} className={`mx-auto block bg-white shadow-md ring-1 ring-slate-200/80 ${ready && !failed ? "" : "hidden"}`} />
      </div>
    </div>
  );
}

function AgreementPdfDialog({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex h-[min(92dvh,860px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B4F8A]">Agreement</p>
            <h3 className="mt-1 truncate text-lg font-bold text-slate-900">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 bg-slate-100 p-3">
          <div className="min-h-0 min-w-0 flex-1">
            <PdfPreview url={url} title={title} tall />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <button type="button" className="nl-btn-secondary" onClick={onClose}><X className="h-4 w-4" strokeWidth={2.25} />Close</button>
          <a className="nl-btn-primary" href={downloadHref(url)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" strokeWidth={2.25} />Download PDF</a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function agreementFileKey(file: File | null) {
  if (!file) return "";
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function AgreementWizard({ draft = null, intent = "create", onClose, onPublished }: { draft?: AgreementDetail | null; intent?: "create" | "edit" | "publish"; onClose: () => void; onPublished: (id: number) => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const initialCategory = splitDocumentCategory(draft?.category ?? "");
  const [categorySelect, setCategorySelect] = useState(initialCategory.selection);
  const [customCategory, setCustomCategory] = useState(initialCategory.customName);
  const [categories, setCategories] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState(dateInput(draft?.due_at));
  const [effectiveAt, setEffectiveAt] = useState(dateInput(draft?.effective_at));
  const [expiresAt, setExpiresAt] = useState(dateInput(draft?.expires_at));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(draft?.file_url ?? null);
  const [scope, setScope] = useState<Scope>("all");
  const [residents, setResidents] = useState<RecipientOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [residentCount, setResidentCount] = useState(0);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(draft?.id ?? null);
  const [savedFile, setSavedFile] = useState<{ name: string; size: number; pages: number | null } | null>(
    draft ? { name: draft.file_name, size: draft.file_size, pages: draft.page_count } : null,
  );
  const [dragOver, setDragOver] = useState(false);
  const [mounted, setMounted] = useState(false);
  const baselineRef = useRef(JSON.stringify({
    title: draft?.title ?? "",
    description: draft?.description ?? "",
    category: draft?.category ?? "",
    dueAt: dateInput(draft?.due_at),
    effectiveAt: dateInput(draft?.effective_at),
    expiresAt: dateInput(draft?.expires_at),
    fileKey: "",
    scope: "all",
    users: "",
    units: "",
    notify: true,
  }));
  const closingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { touch, showError, validateOnSubmit } = useTouchedFieldErrors();

  const categoryOptions = useMemo(() => buildDocumentCategoryOptions(categories), [categories]);
  const category = resolveDocumentCategory(categorySelect, customCategory);
  const formKey = useMemo(
    () => JSON.stringify({
      title,
      description,
      category,
      dueAt,
      effectiveAt,
      expiresAt,
      fileKey: agreementFileKey(file),
      scope,
      users: selectedUsers.join(","),
      units: selectedUnits.join(","),
      notify,
    }),
    [title, description, category, dueAt, effectiveAt, expiresAt, file, scope, selectedUsers, selectedUnits, notify],
  );
  const dirty = formKey !== baselineRef.current;
  const liveErrors = useMemo(
    () => validateAgreementDetails({
      title,
      description,
      category,
      dueAt,
      effectiveAt,
      expiresAt,
      hasFile: Boolean(file) || Boolean(draftId),
    }),
    [title, description, category, dueAt, effectiveAt, expiresAt, file, draftId],
  );

  const markSaved = () => {
    baselineRef.current = formKey;
  };

  useEffect(() => {
    void fetchAdminDocuments().then((res) => setCategories(res.categories.map((item) => item.name))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(draft?.file_url ?? null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, draft?.file_url]);

  useEffect(() => {
    if (step !== 2) return;
    const handle = setTimeout(() => {
      void fetchAgreementOptions(search).then((res) => {
        setResidents(res.residents);
        setUnits(res.units);
        setResidentCount(res.resident_count);
      }).catch((err) => toastError(apiError(err)));
    }, 250);
    return () => clearTimeout(handle);
  }, [step, search]);

  const recipientCount = useMemo(() => {
    if (scope === "all") return residentCount;
    if (scope === "residents") return selectedUsers.length;
    return units.filter((unit) => selectedUnits.includes(unit.id)).reduce((sum, unit) => sum + unit.resident_count, 0);
  }, [scope, residentCount, selectedUsers.length, selectedUnits, units]);

  const saveDraft = async () => {
    if (!validateOnSubmit(liveErrors)) return null;
    setBusy(true);
    try {
      if (!draftId) {
        const draft = await createAgreementDraft({
          title: title.trim(),
          category: category.trim(),
          description,
          due_at: dueAt || undefined,
          effective_at: effectiveAt || undefined,
          expires_at: expiresAt || undefined,
          file: file!,
        });
        setDraftId(draft.id);
        setSavedFile({ name: draft.file_name, size: draft.file_size, pages: draft.page_count });
        markSaved();
        return draft.id;
      }
      const updated = await updateAgreementDraft(draftId, {
        title: title.trim(),
        category: category.trim(),
        description,
        due_at: dueAt || undefined,
        effective_at: effectiveAt || undefined,
        expires_at: expiresAt || undefined,
        file,
      });
      setSavedFile({ name: updated.file_name, size: updated.file_size, pages: updated.page_count });
      markSaved();
      return draftId;
    } catch (err) {
      toastError(apiError(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (busy) return;
    const id = draftId ?? (await saveDraft());
    if (!id) return;
    if (scope === "residents" && selectedUsers.length === 0) {
      toastError("Select at least one resident.");
      return;
    }
    if (scope === "units" && selectedUnits.length === 0) {
      toastError("Select at least one unit.");
      return;
    }
    const confirmed = await confirmAction({
      title: "Save this agreement?",
      text: notify
        ? "Selected residents will be notified, and this agreement will be published."
        : "This agreement will be published without notifying residents.",
      confirmText: "Save",
      icon: "question",
      color: "blue",
    });
    if (!confirmed.isConfirmed) return;
    setBusy(true);
    try {
      const result = await publishAgreement(id, {
        scope,
        user_ids: selectedUsers,
        unit_ids: selectedUnits,
        notify,
      });
      toastSuccess(
        result.already_published
          ? "This agreement is already saved."
          : `Agreement saved for ${result.assigned} recipient${result.assigned === 1 ? "" : "s"}.`,
      );
      await onPublished(id);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const acceptPdf = (next: File | null) => {
    touch("file");
    if (next && next.type && next.type !== "application/pdf") {
      toastError("Choose a PDF file.");
      return;
    }
    setFile(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const requestClose = useCallback(async () => {
    if (busy || closingRef.current) return;
    if (dirty) {
      closingRef.current = true;
      const result = await confirmAction({
        title: "Discard unsaved changes?",
        text: "This agreement has changes that have not been saved. Closing will lose them.",
        confirmText: "Discard",
        icon: "warning",
        color: "amber",
      });
      closingRef.current = false;
      if (!result.isConfirmed) return;
    }
    onClose();
  }, [busy, dirty, onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void requestClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [requestClose]);

  const continueStep = () => {
    if (step === 1 && !validateOnSubmit(liveErrors)) return;
    void (async () => {
      if (step === 1) {
        const id = await saveDraft();
        if (!id) return;
      }
      setStep((value) => value + 1);
    })();
  };

  if (!mounted) return null;

  const scopeLabel = scope === "all" ? "All eligible residents" : scope === "residents" ? "Selected residents" : "Selected units";
  const reviewFileName = file?.name || savedFile?.name || "";
  const reviewFileDetail = [
    file || savedFile ? fileSize(file?.size ?? savedFile?.size ?? 0) : "",
    !file && savedFile?.pages ? `${savedFile.pages} pages` : "",
  ].filter(Boolean).join(" · ");

  return createPortal(
    <div className="nl-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-[2px] sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => void requestClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agreement-title"
        aria-busy={busy}
        className="relative z-10 flex h-[min(90dvh,calc(100dvh-1.5rem))] w-full max-w-[850px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:h-[min(90dvh,calc(100dvh-3rem))]"
        style={{ animation: "nl-modal-in 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <header className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B4F8A]">Agreements</p>
              <h2 id="create-agreement-title" className="mt-1 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{intent === "edit" ? "Edit draft" : intent === "publish" ? "Save agreement" : "Create Agreement"}</h2>
              <p className="mt-1 text-sm text-slate-500">{intent === "create" ? "Add the agreement, choose who must sign it, then save." : "Review and update the PDF, details, and recipients, then save."}</p>
            </div>
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={busy}
              className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="mt-4 grid grid-cols-3 gap-2 sm:gap-3" aria-label="Create agreement steps">
            {AGREEMENT_STEPS.map((item) => {
              const done = step > item.id;
              const active = step === item.id;
              return (
                <li key={item.id} aria-current={active ? "step" : undefined} className="min-w-0">
                  <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full bg-[#1B4F8A] transition-all duration-300 ${step >= item.id ? "w-full" : "w-0"}`} />
                  </div>
                  <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold leading-4 sm:text-xs ${active ? "text-[#1B4F8A]" : done ? "text-slate-700" : "text-slate-400"}`}>
                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${active ? "bg-[#1B4F8A] text-white" : done ? "bg-[#E8F0F7] text-[#1B4F8A]" : "bg-slate-100 text-slate-400"}`}>
                      {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <item.icon className="h-3 w-3" strokeWidth={2.25} />}
                    </span>
                    <span className="min-w-0 leading-4">{item.label}</span>
                  </p>
                </li>
              );
            })}
          </ol>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-5 py-5 sm:px-6">
          <div key={step} className="space-y-4" style={{ animation: "nl-modal-in 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
            {step === 1 ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="nl-label">Title *
                  <input
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); touch("title"); }}
                    onBlur={() => touch("title")}
                    maxLength={200}
                    className={inputClass(showError("title", liveErrors), "nl-input mt-1.5 font-normal")}
                    placeholder="Community rules agreement"
                  />
                  {showError("title", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("title", liveErrors)}</p> : null}
                  <CharCount value={title} max={200} />
                </label>
                <label className="nl-label">Category *
                  <div className="mt-1.5">
                    <ThemedSelect
                      value={categorySelect}
                      placeholder="Select category…"
                      error={showError("category", liveErrors) || undefined}
                      options={categoryOptions.map((name) => ({ value: name, label: name }))}
                      onChange={(value) => {
                        setCategorySelect(value);
                        touch("category");
                        if (!isDocumentOtherCategory(value)) setCustomCategory("");
                      }}
                      onBlur={() => touch("category")}
                    />
                  </div>
                  {isDocumentOtherCategory(categorySelect) ? (
                    <input
                      value={customCategory}
                      onChange={(e) => { setCustomCategory(e.target.value); touch("category"); }}
                      onBlur={() => touch("category")}
                      maxLength={100}
                      className={inputClass(showError("category", liveErrors), "nl-input mt-2 font-normal")}
                      placeholder="Enter custom category name"
                    />
                  ) : null}
                  {showError("category", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("category", liveErrors)}</p> : null}
                </label>
                <label className="nl-label sm:col-span-2">Description *
                  <textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); touch("description"); }}
                    onBlur={() => touch("description")}
                    maxLength={5000}
                    rows={3}
                    style={{ resize: "none" }}
                    className={inputClass(showError("description", liveErrors), "nl-input mt-1.5 min-h-24 resize-none overflow-y-auto font-normal")}
                    placeholder="What residents are agreeing to"
                  />
                  {showError("description", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("description", liveErrors)}</p> : null}
                  <CharCount value={description} max={5000} />
                </label>
                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
                  <div>
                    <p className="nl-label mb-1.5">Due date *</p>
                    <ThemedDatePicker
                      placeholder="Select due date"
                      value={dueAt}
                      min={isoToday()}
                      error={showError("dueAt", liveErrors) || undefined}
                      onBlur={() => touch("dueAt")}
                      onChange={(value) => {
                        setDueAt(value);
                        touch("dueAt");
                        if (expiresAt && value && expiresAt < value) setExpiresAt(value);
                      }}
                    />
                    {showError("dueAt", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("dueAt", liveErrors)}</p> : null}
                  </div>
                  <div>
                    <p className="nl-label mb-1.5">Effective date *</p>
                    <ThemedDatePicker
                      placeholder="Select effective date"
                      value={effectiveAt}
                      min={isoToday()}
                      error={showError("effectiveAt", liveErrors) || undefined}
                      onBlur={() => touch("effectiveAt")}
                      onChange={(value) => {
                        setEffectiveAt(value);
                        touch("effectiveAt");
                        if (expiresAt && value && expiresAt < value) setExpiresAt(value);
                      }}
                    />
                    {showError("effectiveAt", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("effectiveAt", liveErrors)}</p> : null}
                  </div>
                  <div>
                    <p className="nl-label mb-1.5">Expiration date *</p>
                    <ThemedDatePicker
                      placeholder="Select expiration date"
                      value={expiresAt}
                      min={latestDate([isoToday(), dueAt, effectiveAt])}
                      error={showError("expiresAt", liveErrors) || undefined}
                      onBlur={() => touch("expiresAt")}
                      onChange={(value) => { setExpiresAt(value); touch("expiresAt"); }}
                    />
                    {showError("expiresAt", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("expiresAt", liveErrors)}</p> : null}
                  </div>
                  <p className="text-xs leading-5 text-slate-500 sm:col-span-3">Expiration must be on or after both the due date and the effective date. Dates before today are unavailable.</p>
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <p className="nl-label">Agreement PDF *</p>
                  <input
                    ref={fileInputRef}
                    id="agreement-pdf-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(event) => acceptPdf(event.target.files?.[0] ?? null)}
                  />
                  {file || (draft && savedFile) ? (
                    <div
                      className={`mt-1.5 flex items-center gap-3 rounded-xl border px-3 py-3 transition ${dragOver ? "border-[#1B4F8A] bg-[#E8F0F7]" : "border-slate-200 bg-white"}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOver(false);
                        acceptPdf(event.dataTransfer.files?.[0] ?? null);
                      }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100" aria-hidden>
                        <FileText className="h-4 w-4" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-all text-sm font-semibold leading-5 text-slate-900" title={file?.name || savedFile?.name || "PDF"}>{file?.name || savedFile?.name || "PDF"}</p>
                        <p className="text-xs text-slate-500">{fileSize(file?.size ?? savedFile?.size ?? 0)}{!file && savedFile?.pages ? ` · ${savedFile.pages} pages` : ""}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#1B4F8A] hover:bg-[#E8F0F7]" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-3.5 w-3.5" strokeWidth={2.25} />
                          Replace
                        </button>
                        {file ? (
                          <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => acceptPdf(null)}>
                            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="agreement-pdf-file"
                      onClick={() => touch("file")}
                      className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition ${showError("file", liveErrors) ? "border-red-300 bg-red-50/50" : dragOver ? "border-[#1B4F8A] bg-[#E8F0F7]" : "border-slate-300 bg-slate-50 hover:border-[#1B4F8A] hover:bg-[#F4F8FC]"}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOver(false);
                        acceptPdf(event.dataTransfer.files?.[0] ?? null);
                      }}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#1B4F8A] shadow-sm ring-1 ring-slate-200">
                        <Upload className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <span className="mt-3 text-sm font-semibold text-slate-800">Drop a PDF here, or browse</span>
                      <span className="mt-1 max-w-sm text-xs leading-5 text-slate-500">PDF only, up to 10 MB. Residents open this file before they sign.</span>
                    </label>
                  )}
                  {showError("file", liveErrors) ? <p className="mt-1 text-xs text-red-600">{showError("file", liveErrors)}</p> : null}
                </div>
                {previewUrl ? (
                  <div className="sm:col-span-2">
                    <PdfPreview url={previewUrl} title={file?.name || savedFile?.name || "Agreement"} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    { key: "all" as const, label: "All residents", hint: "Everyone eligible", icon: Users },
                    { key: "residents" as const, label: "Selected residents", hint: "Pick people", icon: CheckCircle2 },
                    { key: "units" as const, label: "Selected units", hint: "Pick homes", icon: Home },
                  ]).map((item) => {
                    const active = scope === item.key;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (item.key === scope) return;
                          setScope(item.key);
                          setSearch("");
                        }}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[#1B4F8A] bg-[#F4F8FC] text-[#1B4F8A] shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-[#1B4F8A] text-white" : "bg-slate-100 text-slate-500"}`}>
                          <Icon className="h-4 w-4" strokeWidth={2.25} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{item.label}</span>
                          <span className={`block text-[11px] ${active ? "text-[#1B4F8A]/80" : "text-slate-400"}`}>{item.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {scope === "residents" || scope === "units" ? (
                  <div className="nl-search-field">
                    <Search className="nl-search-icon" aria-hidden />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={scope === "residents" ? "Search residents" : "Search units"}
                      aria-label={scope === "residents" ? "Search residents" : "Search units"}
                      className="nl-input"
                    />
                  </div>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">Every eligible resident in this community will be asked to sign.</p>
                )}
                <p className="text-sm font-medium text-slate-700">{recipientCount} recipient{recipientCount === 1 ? "" : "s"} will be asked to sign</p>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1 sm:max-h-80">
                  {scope === "residents" ? residents.map((person) => {
                    const selected = selectedUsers.includes(person.id);
                    return (
                    <label key={person.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${selected ? "border-[#1B4F8A] bg-[#F4F8FC]" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" className="nl-member-check mt-0.5" checked={selected} onChange={() => setSelectedUsers((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} />
                      <span>
                        <span className="block font-semibold text-slate-800">{person.name}</span>
                        <span className="text-slate-400">{person.units.map((unit) => unit.unit_number).join(", ") || "No unit"} · {person.status}</span>
                      </span>
                    </label>
                    );
                  }) : null}
                  {scope === "units" ? units.map((unit) => {
                    const selected = selectedUnits.includes(unit.id);
                    return (
                    <label key={unit.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${selected ? "border-[#1B4F8A] bg-[#F4F8FC]" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" className="nl-member-check mt-0.5" checked={selected} onChange={() => setSelectedUnits((current) => current.includes(unit.id) ? current.filter((id) => id !== unit.id) : [...current, unit.id])} />
                      <span>
                        <span className="block font-semibold text-slate-800">Unit {unit.unit_number}</span>
                        <span className="text-slate-400">{unit.residents.map((person) => person.name).join(", ") || "No eligible resident"}</span>
                      </span>
                    </label>
                    );
                  }) : null}
                  {scope === "residents" && residents.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">No residents match this search.</p> : null}
                  {scope === "units" && units.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">No units match this search.</p> : null}
                </div>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${notify ? "border-[#1B4F8A] bg-[#F4F8FC] text-slate-800" : "border-slate-200 text-slate-600"}`}>
                  <input type="checkbox" className="nl-member-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  <Bell className="h-4 w-4 shrink-0 text-[#1B4F8A]" strokeWidth={2.25} aria-hidden />
                  <span>
                    <span className="block font-semibold">Notify residents when this agreement is saved</span>
                    <span className="text-xs text-slate-500">{notify ? "They will get a notification to review and sign." : "No notification will be sent."}</span>
                  </span>
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
                {[
                  ["Title", title || "Not set"],
                  ["Category", category || "Not set"],
                  ["Due date", formatAgreementDate(dueAt)],
                  ["Effective date", formatAgreementDate(effectiveAt)],
                  ["Expiration date", formatAgreementDate(expiresAt)],
                  ["Recipients", `${scopeLabel} · ${recipientCount}`],
                  ["Signature", "Required"],
                  ["Notifications", notify ? "Send on save" : "Do not notify"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
                  </div>
                ))}
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Description</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">{description.trim() || "Not set"}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">File</dt>
                  <dd className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                    <FileText className="h-4 w-4 shrink-0 text-[#1B4F8A]" />
                    <span className="min-w-0 flex-1 truncate" title={reviewFileName || undefined}>{reviewFileName || "—"}</span>
                    {reviewFileDetail ? <span className="shrink-0 font-normal text-slate-500">{reviewFileDetail}</span> : null}
                  </dd>
                  {previewUrl ? <div className="mt-3"><PdfPreview url={previewUrl} title={title || reviewFileName || "Agreement"} /></div> : null}
                </div>
              </dl>
            ) : null}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" className="nl-btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={busy || step === 1} onClick={() => setStep((value) => value - 1)}><ArrowLeft className="h-4 w-4" strokeWidth={2.25} />Back</button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === 3 ? (
              <button type="button" className="nl-btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => void saveDraft().then((id) => { if (id) toastSuccess("Draft saved"); })}><PenLine className="h-4 w-4" strokeWidth={2.25} />Draft</button>
            ) : null}
            {step < 3 ? (
              <button type="button" className="nl-btn-primary w-full sm:w-auto" disabled={busy} onClick={continueStep}>
                {busy ? "Saving…" : "Continue"}
                {busy ? null : <ArrowRight className="h-4 w-4" strokeWidth={2.25} />}
              </button>
            ) : (
              <button type="button" className="nl-btn-primary w-full sm:w-auto" disabled={busy} onClick={() => void publish()}><Check className="h-4 w-4" strokeWidth={2.25} />{busy ? "Saving…" : "Save"}</button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function AgreementDetailView({
  detail,
  recipientQuery,
  onRecipientQuery,
  onClose,
  onChange,
  onViewPdf,
}: {
  detail: AgreementDetail;
  recipientQuery: string;
  onRecipientQuery: (value: string) => void;
  onClose: () => void;
  onChange: () => Promise<void>;
  onViewPdf: (url: string, title: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [signatureFilter, setSignatureFilter] = useState<"all" | "signed" | "pending" | "overdue" | "expired" | "declined">("all");
  const stats = detail.stats;
  const signedCount = detail.recipients.filter((row) => row.display_status === "signed").length;
  const pendingCount = detail.recipients.filter((row) => row.display_status === "pending" || row.display_status === "viewed").length;
  const overdueCount = detail.recipients.filter((row) => row.display_status === "overdue").length;
  const expiredCount = detail.recipients.filter((row) => row.display_status === "expired").length;
  const declinedCount = detail.recipients.filter((row) => row.display_status === "declined").length;
  const recipients = detail.recipients.filter((row) => {
    if (signatureFilter === "signed" && row.display_status !== "signed") return false;
    if (signatureFilter === "pending" && row.display_status !== "pending" && row.display_status !== "viewed") return false;
    if (signatureFilter === "overdue" && row.display_status !== "overdue") return false;
    if (signatureFilter === "expired" && row.display_status !== "expired") return false;
    if (signatureFilter === "declined" && row.display_status !== "declined") return false;
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return true;
    return row.resident_name.toLowerCase().includes(query) || (row.unit_label ?? "").toLowerCase().includes(query);
  });

  useEffect(() => {
    setSignatureFilter("all");
  }, [detail.id]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await onChange();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1B4F8A]">Signature Tracking</p>
            <div className="mt-1 flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">{detail.title}</h3>
            {agreementStatusLabel(detail.publication_status) ? (
              <AdminBadge tone={STATUS_TONE[detail.publication_status] ?? "slate"}>{agreementStatusLabel(detail.publication_status)}</AdminBadge>
            ) : null}
            {(stats?.expired ?? 0) > 0 ? <AdminBadge tone="red">Expired</AdminBadge> : (stats?.overdue ?? 0) > 0 ? <AdminBadge tone="amber">Overdue</AdminBadge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">Version {detail.version} · {detail.created_by_name ?? "Admin"}{detail.published_at ? ` · Published ${formatWhen(detail.published_at)}` : ""}</p>
        </div>
        <button type="button" className="text-sm font-semibold text-slate-500" onClick={onClose}>Close</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {[
          ["Recipients", stats?.recipients ?? 0],
          ["Signed", stats?.signed ?? 0],
          ["Pending", stats?.pending ?? 0],
          ["Viewed", stats?.viewed ?? 0],
          ["Declined", stats?.declined ?? 0],
          ["Overdue", stats?.overdue ?? 0],
          ["Expired", stats?.expired ?? 0],
          ["Due", formatWhen(detail.due_at)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-100 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-sm font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="mb-2 flex flex-wrap gap-2">
          {([
            ["all", "All", detail.recipients.length],
            ["pending", "Pending", pendingCount],
            ["overdue", "Overdue", overdueCount],
            ["signed", "Signed", signedCount],
            ["declined", "Declined", declinedCount],
            ["expired", "Expired", expiredCount],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSignatureFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${signatureFilter === key ? "border-[#1B4F8A] bg-[#1B4F8A] text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {label} {count}
            </button>
          ))}
        </div>
        <input value={recipientQuery} onChange={(e) => onRecipientQuery(e.target.value)} placeholder="Search recipients" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3">Resident</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Delivery</th>
                <th className="py-2 pr-3">Viewed</th>
                <th className="py-2 pr-3">Signature</th>
                <th className="py-2 pr-3">Signed</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-slate-400">No residents in this filter.</td>
                </tr>
              ) : null}
              {recipients.map((row) => (
                <tr key={row.id} className="border-t border-slate-50">
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.resident_name}</td>
                  <td className="py-2 pr-3">{row.unit_label ?? "—"}</td>
                  <td className="py-2 pr-3">{row.delivery_status}</td>
                  <td className="py-2 pr-3">{formatWhen(row.viewed_at)}</td>
                  <td className="py-2 pr-3">{recipientStatusLabel(row.display_status)}</td>
                  <td className="py-2 pr-3">{formatWhen(row.signed_at)}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      {(row.display_status === "pending" || row.display_status === "overdue") ? (
                        <button type="button" className="font-semibold text-[#1B4F8A]" disabled={busy} onClick={() => void run(async () => { const result = await remindAgreement(detail.id, row.id); toastSuccess(result.sent ? "Reminder sent" : "Reminder was already sent"); })}>Remind</button>
                      ) : null}
                      {row.signed_file_url ? <button type="button" className="font-semibold text-[#1B4F8A]" onClick={() => onViewPdf(row.signed_file_url!, `${row.resident_name} · ${detail.title}`)}>View signed PDF</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function assignedResidents(detail: AgreementDetail) {
  const names = detail.recipients
    .filter((person) => person.signature_status !== "revoked" && person.resident_name?.trim())
    .map((person) => person.unit_label ? `${person.resident_name} (Unit ${person.unit_label})` : person.resident_name);
  if (detail.assignment_scope === "all") return "All residents";
  if (names.length) return names.join(", ");
  if (detail.assignment_scope === "units") return "Selected units";
  if (detail.assignment_scope === "residents") return "Selected residents";
  return "Not assigned yet";
}

function publicationLabel(status: string) {
  if (status === "published") return "Published";
  return agreementStatusLabel(status) || status;
}

function AgreementInfoDialog({ detail, onClose }: { detail: AgreementDetail; onClose: () => void }) {
  const dates = ([
    ["Due", detail.due_at],
    ["Effective", detail.effective_at],
    ["Expiration", detail.expires_at],
    ["Published", detail.published_at],
  ] as [string, string | null][]).filter((entry): entry is [string, string] => Boolean(entry[1]));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="agreement-details-title">
        <div className="shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1B4F8A]">Agreement</p>
              <h3 id="agreement-details-title" className="mt-1 text-lg font-bold text-slate-900">View Details</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          <dl className="divide-y divide-slate-100">
            <InfoField label="Title">{detail.title}</InfoField>
            {detail.description?.trim() ? (
              <InfoField label="Description"><span className="whitespace-pre-wrap break-words">{detail.description.trim()}</span></InfoField>
            ) : null}
            {detail.category?.trim() ? <InfoField label="Category">{detail.category}</InfoField> : null}
            <InfoField label="Assigned To"><span className="break-words">{assignedResidents(detail)}</span></InfoField>
            {dates.map(([label, value]) => (
              <InfoField key={label} label={label}>{formatWhen(value ?? null)}</InfoField>
            ))}
            <InfoField label="Status">
              <span className="inline-flex flex-wrap items-center gap-2">
                <AdminBadge tone={STATUS_TONE[detail.publication_status] ?? "slate"}>{publicationLabel(detail.publication_status)}</AdminBadge>
                <span className="text-slate-500">Version {detail.version}</span>
              </span>
            </InfoField>
            <InfoField label="File">
              <p className="truncate font-medium text-slate-900" title={detail.file_name}>{detail.file_name}</p>
              <p className="text-slate-500">{fileSize(detail.file_size)}{detail.page_count ? ` · ${detail.page_count} pages` : ""}</p>
              {detail.file_url ? (
                <div className="mt-3">
                  <PdfPreview url={detail.file_url} title={detail.title} />
                </div>
              ) : null}
            </InfoField>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary"><X className="h-4 w-4" strokeWidth={2.25} />Close</button>
          {detail.file_url ? (
            <a className="nl-btn-primary" href={downloadHref(detail.file_url)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" strokeWidth={2.25} />Download PDF</a>
          ) : <span />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[13px] font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-slate-800">{children}</dd>
    </div>
  );
}

function AgreementVersionDialog({
  source,
  onClose,
  onCreated,
}: {
  source: AgreementSummary;
  onClose: () => void;
  onCreated: (draft: AgreementSummary) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const chooseFile = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    const isPdf = next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toastError("Choose a PDF file.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      toastError("PDF must be 10 MB or less.");
      return;
    }
    setFile(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const draft = await createAgreementVersion(source.id, file, {
        title: source.title,
        category: source.category,
        description: source.description && source.description.trim().length >= 10 ? source.description : undefined,
        due_at: source.due_at,
        effective_at: source.effective_at,
        expires_at: source.expires_at,
      });
      await onCreated(draft);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="agreement-version-title">
        <div className="shrink-0 border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1B4F8A]">Agreement</p>
              <h3 id="agreement-version-title" className="mt-1 text-lg font-bold text-slate-900">Create New Version</h3>
              <p className="mt-1 text-sm text-slate-500">The current agreement, its signatures, and signed PDFs stay on file. This upload is saved as a new draft.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="nl-label">PDF</p>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          {file ? (
            <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[#1B4F8A]" />
                <p className="truncate text-sm text-slate-700" title={file.name}>{file.name} · {fileSize(file.size)}</p>
              </div>
              <button type="button" className="shrink-0 text-sm font-semibold text-[#1B4F8A]" onClick={() => chooseFile(null)}>Remove</button>
            </div>
          ) : (
            <button type="button" className="mt-1.5 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-[#1B4F8A] hover:bg-[#F4F8FC]" onClick={() => inputRef.current?.click()}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#1B4F8A] shadow-sm"><Upload className="h-4 w-4" /></span>
              <span className="mt-2 text-sm font-semibold text-slate-800">Choose a PDF</span>
              <span className="mt-0.5 text-xs text-slate-500">PDF only, up to 10 MB.</span>
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button type="button" className="nl-btn-secondary" onClick={onClose} disabled={busy}><X className="h-4 w-4" strokeWidth={2.25} />Close</button>
          <button type="button" className="nl-btn-primary disabled:opacity-60" onClick={() => void submit()} disabled={busy || !file}><FileText className="h-4 w-4" strokeWidth={2.25} />{busy ? "Saving…" : "Create version"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
