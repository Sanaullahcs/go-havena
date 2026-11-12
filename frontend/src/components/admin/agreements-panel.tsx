"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarOff, Check, CheckCircle2, ChevronDown, Clock, FileText, Upload, X } from "lucide-react";
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
  const [search, setSearch] = useState("");
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

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await fetchAgreements({
        status,
        search,
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
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search, category]);

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
        onClick: () => window.open(row.file_url, "_blank", "noopener,noreferrer"),
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
  const filters = [
    { key: "all", label: "All", count: counts.all },
    { key: "signed", label: "Signed", count: counts.signed },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "archived", label: "Archived", count: counts.archived },
    { key: "draft", label: "Draft", count: counts.draft },
    { key: "expired", label: "Expired", count: counts.expired },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total Agreements" value={String(counts.all)} hint="All records" tone="blue" icon={<FileText className="h-5 w-5" />} />
        <StatTile label="Pending" value={String(counts.pending ?? 0)} hint="Awaiting signature" tone="amber" icon={<Clock className="h-5 w-5" />} />
        <StatTile label="Signed" value={String(counts.signed ?? 0)} hint="Fully signed" tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatTile label="Overdue" value={String(counts.overdue)} hint="Deadline passed" tone="red" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatTile label="Expired" value={String(counts.expired)} hint="No longer in effect" tone="violet" icon={<CalendarOff className="h-5 w-5" />} />
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
          onChange={async () => {
            await load(page);
            await openDetail(detail.id);
          }}
        />
      ) : null}

      <DataTable
        title="Agreements"
        totalCount={meta.total}
        visibleCount={rows.length}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search agreements"
        searchClassName="min-w-0 w-full sm:w-56"
        beforeSearch={
          <div className="relative shrink-0">
            <select
              aria-label="Category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="h-8 w-44 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-9 text-[12.5px] font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-52"
            >
              <option value="all">All categories</option>
              {DOCUMENT_PRESET_CATEGORIES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value={DOCUMENT_OTHER_CATEGORY}>{DOCUMENT_OTHER_CATEGORY}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
          </div>
        }
        loading={loading}
        filters={filters}
        activeFilter={status}
        onFilter={(key) => {
          setStatus(key);
          setPage(1);
        }}
        isEmpty={!loading && rows.length === 0}
        empty={search || category !== "all" ? "No agreements match your filters." : "No agreements yet."}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Agreement</th>
                <th className="px-4 py-3 font-semibold">Assigned</th>
                <th className="px-4 py-3 font-semibold">Signed</th>
                <th className="px-4 py-3 font-semibold">Pending</th>
                <th className="px-4 py-3 font-semibold">Declined</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50" onClick={() => void openDetail(row.id)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{row.title}</div>
                    <div className="text-xs text-slate-400">{row.category} · v{row.version}</div>
                  </td>
                  <td className="px-4 py-3">{row.stats?.recipients ?? 0}</td>
                  <td className="px-4 py-3">{row.stats?.signed ?? 0}</td>
                  <td className="px-4 py-3">{row.stats?.pending ?? 0}</td>
                  <td className="px-4 py-3">{row.stats?.declined ?? 0}</td>
                  <td className="px-4 py-3">{formatWhen(row.due_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {agreementStatusLabel(row.publication_status) ? (
                        <AdminBadge tone={STATUS_TONE[row.publication_status] ?? "slate"}>{agreementStatusLabel(row.publication_status)}</AdminBadge>
                      ) : null}
                      {(row.stats?.expired ?? 0) > 0 ? (
                        <AdminBadge tone="red">Expired</AdminBadge>
                      ) : (row.stats?.overdue ?? 0) > 0 ? (
                        <AdminBadge tone="amber">Overdue</AdminBadge>
                      ) : row.publication_status === "published" && (row.stats?.signed ?? 0) > 0 && (row.stats?.pending ?? 0) === 0 ? (
                        <AdminBadge tone="green">Signed</AdminBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatWhen(row.updated_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <AdminActionsMenu actions={rowActions(row)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataTable>
      <DtPagination showing={rows.length} total={meta.total} page={meta.current_page} lastPage={meta.last_page} pageSize={20} onPageChange={setPage} />
    </div>
  );
}

const AGREEMENT_STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Assign Residents" },
  { id: 3, label: "Review & Save" },
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
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${active ? "bg-[#1B4F8A] text-white" : done ? "bg-[#E8F0F7] text-[#1B4F8A]" : "bg-slate-100 text-slate-500"}`}>
                      {done ? <Check className="h-2.5 w-2.5" /> : item.id}
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
                <label className="nl-label">Title
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
                <label className="nl-label">Category
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
                    rows={4}
                    style={{ resize: "none" }}
                    className={inputClass(showError("description", liveErrors), "nl-input mt-1.5 min-h-24 resize-none overflow-y-auto font-normal")}
                    placeholder="What residents are agreeing to"
                  />
                  {showError("description", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("description", liveErrors)}</p> : null}
                  <CharCount value={description} max={5000} />
                </label>
                <label className="nl-label">Due date
                  <input
                    type="date"
                    value={dueAt}
                    onChange={(e) => { setDueAt(e.target.value); touch("dueAt"); }}
                    onBlur={() => touch("dueAt")}
                    className={inputClass(showError("dueAt", liveErrors), "nl-input mt-1.5 block w-full min-w-0 font-normal")}
                  />
                  {showError("dueAt", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("dueAt", liveErrors)}</p> : null}
                </label>
                <label className="nl-label">Effective date
                  <input
                    type="date"
                    value={effectiveAt}
                    onChange={(e) => { setEffectiveAt(e.target.value); touch("effectiveAt"); }}
                    onBlur={() => touch("effectiveAt")}
                    className={inputClass(showError("effectiveAt", liveErrors), "nl-input mt-1.5 block w-full min-w-0 font-normal")}
                  />
                  {showError("effectiveAt", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("effectiveAt", liveErrors)}</p> : null}
                </label>
                <label className="nl-label">Expiration date
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => { setExpiresAt(e.target.value); touch("expiresAt"); }}
                    onBlur={() => touch("expiresAt")}
                    className={inputClass(showError("expiresAt", liveErrors), "nl-input mt-1.5 block w-full min-w-0 font-normal")}
                  />
                  {showError("expiresAt", liveErrors) ? <p className="mt-1 text-xs font-normal text-red-600">{showError("expiresAt", liveErrors)}</p> : null}
                </label>
                <div className="min-w-0 sm:col-span-2">
                  <p className="nl-label">PDF</p>
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
                      className={`mt-1.5 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${dragOver ? "border-[#1B4F8A] bg-[#E8F0F7]" : "border-slate-200 bg-white"}`}
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
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-[#1B4F8A]" />
                        <p className="truncate text-sm text-slate-700">{file ? `${file.name} · ${fileSize(file.size)}` : `${savedFile?.name ?? "PDF"} · ${fileSize(savedFile?.size ?? 0)}`}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <button type="button" className="text-sm font-semibold text-[#1B4F8A]" onClick={() => fileInputRef.current?.click()}>Replace</button>
                        {file ? <button type="button" className="text-sm font-semibold text-[#1B4F8A]" onClick={() => acceptPdf(null)}>Remove</button> : null}
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="agreement-pdf-file"
                      onClick={() => touch("file")}
                      className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center transition ${showError("file", liveErrors) ? "border-red-300 bg-red-50/50" : dragOver ? "border-[#1B4F8A] bg-[#E8F0F7]" : "border-slate-300 bg-slate-50 hover:border-[#1B4F8A] hover:bg-[#F4F8FC]"}`}
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
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#1B4F8A] shadow-sm">
                        <Upload className="h-4 w-4" />
                      </span>
                      <span className="mt-2 text-sm font-semibold text-slate-800">Drop a PDF here, or browse</span>
                      <span className="mt-0.5 text-xs text-slate-500">PDF only. Residents review this file before signing.</span>
                    </label>
                  )}
                  {showError("file", liveErrors) ? <p className="mt-1 text-xs text-red-600">{showError("file", liveErrors)}</p> : null}
                </div>
                {previewUrl ? (
                  <iframe
                    title="Agreement preview"
                    src={`${previewUrl}#page=1&view=Fit&zoom=page-fit&toolbar=1&navpanes=0&scrollbar=1`}
                    className="h-[min(48dvh,420px)] min-h-[260px] w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50 sm:col-span-2 sm:h-[clamp(500px,56dvh,600px)] sm:min-h-[500px]"
                  />
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(["all", "residents", "units"] as Scope[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        if (item === scope) return;
                        setScope(item);
                        setSearch("");
                      }}
                      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${scope === item ? "border-[#1B4F8A] bg-[#1B4F8A] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {item === "all" ? "All residents" : item === "residents" ? "Selected residents" : "Selected units"}
                    </button>
                  ))}
                </div>
                {scope === "residents" || scope === "units" ? (
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={scope === "residents" ? "Search residents" : "Search units"}
                    aria-label={scope === "residents" ? "Search residents" : "Search units"}
                    className="nl-input"
                  />
                ) : null}
                <p className="text-sm text-slate-500">{recipientCount} recipient{recipientCount === 1 ? "" : "s"} in this community</p>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1 sm:max-h-80">
                  {scope === "residents" ? residents.map((person) => (
                    <label key={person.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:border-slate-300">
                      <input type="checkbox" className="mt-1" checked={selectedUsers.includes(person.id)} onChange={() => setSelectedUsers((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} />
                      <span>
                        <span className="block font-semibold text-slate-800">{person.name}</span>
                        <span className="text-slate-400">{person.units.map((unit) => unit.unit_number).join(", ") || "No unit"} · {person.status}</span>
                      </span>
                    </label>
                  )) : null}
                  {scope === "units" ? units.map((unit) => (
                    <label key={unit.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:border-slate-300">
                      <input type="checkbox" className="mt-1" checked={selectedUnits.includes(unit.id)} onChange={() => setSelectedUnits((current) => current.includes(unit.id) ? current.filter((id) => id !== unit.id) : [...current, unit.id])} />
                      <span>
                        <span className="block font-semibold text-slate-800">Unit {unit.unit_number}</span>
                        <span className="text-slate-400">{unit.residents.map((person) => person.name).join(", ") || "No eligible resident"}</span>
                      </span>
                    </label>
                  )) : null}
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  Notify residents when this agreement is saved
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
                {[
                  ["Title", title],
                  ["Recipients", `${scopeLabel} · ${recipientCount}`],
                  ["Due", dueAt || "None"],
                  ["Signature", "Required"],
                  ["Notifications", notify ? "Send on save" : "Do not notify"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
                  </div>
                ))}
                <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">File</dt>
                  <dd className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                    <FileText className="h-4 w-4 shrink-0 text-[#1B4F8A]" />
                    <span className="min-w-0 flex-1 truncate" title={reviewFileName || undefined}>{reviewFileName || "—"}</span>
                    {reviewFileDetail ? <span className="shrink-0 font-normal text-slate-500">{reviewFileDetail}</span> : null}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" className="nl-btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={busy || step === 1} onClick={() => setStep((value) => value - 1)}>Back</button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === 3 ? (
              <button type="button" className="nl-btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => void saveDraft().then((id) => { if (id) toastSuccess("Draft saved"); })}>Draft</button>
            ) : null}
            {step < 3 ? (
              <button type="button" className="nl-btn-primary w-full sm:w-auto" disabled={busy} onClick={continueStep}>
                {busy ? "Saving…" : "Continue"}
              </button>
            ) : (
              <button type="button" className="nl-btn-primary w-full sm:w-auto" disabled={busy} onClick={() => void publish()}>{busy ? "Saving…" : "Save"}</button>
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
}: {
  detail: AgreementDetail;
  recipientQuery: string;
  onRecipientQuery: (value: string) => void;
  onClose: () => void;
  onChange: () => Promise<void>;
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
                      {row.signed_file_url ? <a className="font-semibold text-[#1B4F8A]" href={row.signed_file_url} target="_blank" rel="noreferrer">Signed PDF</a> : null}
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
                <iframe title="Agreement PDF" src={`${detail.file_url}#toolbar=0&navpanes=0`} className="mt-3 h-64 w-full rounded-xl border border-slate-200 bg-slate-50" />
              ) : null}
            </InfoField>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">Close</button>
          {detail.file_url ? (
            <a className="nl-btn-primary" href={detail.file_url} target="_blank" rel="noreferrer">View PDF</a>
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
          <button type="button" className="nl-btn-secondary" onClick={onClose} disabled={busy}>Close</button>
          <button type="button" className="nl-btn-primary disabled:opacity-60" onClick={() => void submit()} disabled={busy || !file}>{busy ? "Saving…" : "Create version"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
