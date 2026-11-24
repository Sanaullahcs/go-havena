"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  Archive,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FilePlus,
  FileText,
  Files,
  FolderOpen,
  Image as ImageIcon,
  PenLine,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { CharCount } from "@/components/admin/char-count";
import { AgreementsPanel } from "@/components/admin/agreements-panel";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import { ThemedTimePicker } from "@/components/ui/themed-time-picker";
import { confirmAction, confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { validateDocumentForm } from "@/lib/admin/document-form-validation";
import {
  DOCUMENT_OTHER_CATEGORY,
  DOCUMENT_PRESET_CATEGORIES,
  buildDocumentCategoryOptions,
  documentMatchesCategory,
  resolveDocumentCategory,
  splitDocumentCategory,
} from "@/lib/admin/document-categories";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { adminTableBusy } from "@/lib/admin/table-loading";
import {
  archiveDocument,
  createDocument,
  deleteDocument,
  extendDocumentDeadline,
  fetchAdminDocuments,
  fetchDocument,
  remindDocument,
  restoreDocument,
  updateDocument,
  type CommunityDocument,
  type DocumentForm,
} from "@/lib/api/documents";
import { fetchAgreementOptions, type RecipientOption } from "@/lib/api/agreements";

const DOCUMENTS_PAGE_SIZE = 6;

const emptyForm: DocumentForm = {
  title: "",
  category: "",
  description: "",
  status: "active",
  file: null,
  publication_status: "published",
  signature_required: false,
  due_at: "",
  assignment_scope: "all",
  user_ids: [],
  notify: true,
  expires_at: "",
};

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dueAtForInput(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return localDateTimeValue(date);
}

type DocumentTab = "all" | "published" | "archived";

function documentLifecycle(doc: CommunityDocument): DocumentTab | "draft" | "overdue" {
  if (doc.lifecycle === "draft" || doc.lifecycle === "published" || doc.lifecycle === "archived" || doc.lifecycle === "overdue") {
    return doc.lifecycle;
  }
  if (doc.publication_status === "draft") return "draft";
  if (doc.publication_status === "archived") return "archived";
  if (doc.expires_at && new Date(doc.expires_at.includes("T") ? doc.expires_at : `${doc.expires_at.replace(" ", "T")}Z`).getTime() <= Date.now()) {
    return "overdue";
  }
  return "published";
}

function isArchivedDocument(doc: CommunityDocument) {
  return documentLifecycle(doc) === "archived";
}

function isPublishedDocument(doc: CommunityDocument) {
  const life = documentLifecycle(doc);
  return life !== "draft" && life !== "archived" && doc.status !== "inactive";
}

function uploadedWithinLastDays(doc: CommunityDocument, days: number) {
  if (!doc.created_at) return false;
  const normalized = doc.created_at.includes("T") ? doc.created_at : `${doc.created_at.replace(" ", "T")}Z`;
  const created = new Date(normalized);
  if (Number.isNaN(created.getTime())) return false;
  return created.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function assignedLabel(doc: CommunityDocument) {
  if (doc.assignment_scope === "residents") {
    const count = doc.assigned_count ?? 0;
    return count === 1 ? "1 resident" : `${count} residents`;
  }
  return "All Residents";
}

function publicationStatus(doc: CommunityDocument): { label: "Draft" | "Archived" | "Published"; tone: "green" | "slate" } {
  const life = doc.lifecycle || documentLifecycle(doc);
  if (life === "draft" || doc.publication_status === "draft") return { label: "Draft", tone: "slate" };
  if (life === "archived" || doc.publication_status === "archived") return { label: "Archived", tone: "slate" };
  return { label: "Published", tone: "green" };
}

function assignedResidentNames(doc: CommunityDocument) {
  return (doc.recipients ?? [])
    .filter((person) => person.signature_status !== "revoked")
    .map((person) => {
      const name = person.resident_name?.trim();
      if (!name) return "";
      return person.unit_label ? `${name} (Unit ${person.unit_label})` : name;
    })
    .filter(Boolean);
}

function formatUploadedDate(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-6">
      <dt className="text-[13px] font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm leading-6 text-slate-800">{children}</dd>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function FileChoicePreview({
  name,
  sizeLabel,
  onRemove,
}: {
  name: string;
  sizeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8F0F7] text-[#1B4F8A]">
        <FileText className="h-5 w-5" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
        <span className="font-medium text-slate-800">{name}</span>
        {sizeLabel ? <span className="text-slate-500"> · {sizeLabel}</span> : null}
      </p>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-700"
        aria-label="Remove file"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

function statusBadge(doc: CommunityDocument): { label: string; tone: "green" | "amber" | "red" | "slate" } {
  const life = documentLifecycle(doc);
  if (life === "draft") return { label: "Draft", tone: "slate" };
  if (life === "archived") return { label: "Archived", tone: "slate" };
  if (doc.signature_required) {
    if (doc.signature_status === "signed") return { label: "Signed", tone: "green" };
    if (doc.signature_status === "overdue") return { label: "Overdue", tone: "red" };
    return { label: "Pending", tone: "amber" };
  }
  if (life === "overdue") return { label: "Overdue", tone: "red" };
  return { label: "Published", tone: "green" };
}

function ResidentMultiSelect({
  residents,
  selectedIds,
  disabled,
  error,
  onChange,
}: {
  residents: RecipientOption[];
  selectedIds: number[];
  disabled?: boolean;
  error?: string;
  onChange: (ids: number[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = residents.filter((person) => selectedIds.includes(person.id));
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return residents;
    return residents.filter((person) =>
      person.name.toLowerCase().includes(text)
      || person.units.some((unit) => unit.unit_number.toLowerCase().includes(text)),
    );
  }, [residents, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((current) => current !== id) : [...selectedIds, id]);
  };

  const summary = selected.length === 0
    ? ""
    : selected.length === 1
      ? selected[0].name
      : `${selected.length} residents selected`;
  const showSummary = !query && summary.length > 0;

  return (
    <div className="mt-3" ref={wrapRef}>
      <div
        className={[
          "overflow-hidden rounded-[0.625rem] border bg-white",
          error
            ? "border-red-400 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
            : open
              ? "border-[#1B4F8A] shadow-[0_0_0_3px_rgba(27,79,138,0.12)]"
              : "border-[#e2e8f0]",
          disabled ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <div className="nl-search-field">
          <Search className="nl-search-icon" aria-hidden />
          <input
            ref={searchRef}
            type="text"
            disabled={disabled}
            value={query}
            aria-expanded={open}
            aria-haspopup="listbox"
            onChange={(event) => {
              setQuery(event.target.value);
              if (!disabled) setOpen(true);
            }}
            onFocus={() => {
              if (!disabled) setOpen(true);
            }}
            placeholder={showSummary ? "" : "Search residents"}
            autoComplete="off"
            spellCheck={false}
            className="nl-input w-full !border-0 !bg-transparent !py-3 !pr-10 !shadow-none focus:!border-transparent focus:!shadow-none"
          />
          {showSummary ? (
            <span className="pointer-events-none absolute inset-y-0 left-9 right-9 flex items-center truncate text-sm font-medium text-slate-900">
              {summary}
            </span>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={open ? "Close resident list" : "Open resident list"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (disabled) return;
              setOpen((current) => !current);
            }}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 rounded p-1 text-slate-400"
          >
            <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {open ? (
          <div
            role="listbox"
            aria-multiselectable="true"
            className="overflow-y-auto overscroll-contain border-t border-slate-100 p-1"
            style={{ maxHeight: "10.5rem", scrollBehavior: "smooth" }}
            onWheel={(event) => {
              const list = event.currentTarget;
              if (list.scrollHeight > list.clientHeight) event.stopPropagation();
            }}
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">No residents match.</p>
            ) : filtered.map((person) => {
              const checked = selectedIds.includes(person.id);
              return (
                <label key={person.id} className={["nl-select-option cursor-pointer", checked ? "nl-select-option-selected" : ""].join(" ")}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-[#1B4F8A]"
                    checked={checked}
                    onChange={() => toggle(person.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((person) => (
            <span key={person.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#E8F0F7] px-2.5 py-1 text-xs font-medium text-[#1B4F8A]">
              <span className="truncate">{person.name}</span>
              {disabled ? null : (
                <button type="button" aria-label={`Remove ${person.name}`} onClick={() => toggle(person.id)} className="rounded-full p-0.5 hover:bg-white/70">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function documentKind(doc: CommunityDocument): "pdf" | "image" | "word" | "file" {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const ext = doc.file_name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (mime.includes("word") || ext === "doc" || ext === "docx") return "word";
  return "file";
}

const DOCUMENT_KIND_STYLE: Record<ReturnType<typeof documentKind>, string> = {
  pdf: "bg-rose-50 text-rose-600 ring-rose-100",
  image: "bg-violet-50 text-violet-600 ring-violet-100",
  word: "bg-sky-50 text-sky-700 ring-sky-100",
  file: "bg-slate-50 text-slate-600 ring-slate-200",
};

function statusIcon(label: string) {
  if (label === "Published" || label === "Signed") return CheckCircle2;
  if (label === "Archived") return Archive;
  if (label === "Overdue") return Clock3;
  return FileText;
}

function fileTypeLabel(doc: CommunityDocument) {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const known: Record<string, string> = {
    "application/pdf": "PDF",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
  };
  if (known[mime]) return known[mime];
  const extension = doc.file_name.split(".").pop()?.trim();
  if (extension && extension !== doc.file_name) return extension.toUpperCase();
  return "File";
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<CommunityDocument[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [section, setSection] = useState<"documents" | "agreements">("documents");
  const [openAgreementId, setOpenAgreementId] = useState<number | null>(null);
  const openAgreementCreate = useRef<(() => void) | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const agreement = Number(params.get("agreement"));
    if (params.get("tab") === "agreements" || (Number.isFinite(agreement) && agreement > 0)) {
      setSection("agreements");
    }
    if (Number.isFinite(agreement) && agreement > 0) setOpenAgreementId(agreement);
  }, []);

  const showSection = (next: "documents" | "agreements") => {
    setSection(next);
    const url = next === "agreements" ? "/admin/documents?tab=agreements" : "/admin/documents";
    window.history.replaceState(null, "", url);
  };

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [docTab, setDocTab] = useState<DocumentTab>("all");
  const [page, setPage] = useState(1);
  const [extending, setExtending] = useState<CommunityDocument | null>(null);
  const [deadlineDraft, setDeadlineDraft] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<CommunityDocument | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingPublication, setEditingPublication] = useState<"draft" | "published" | null>(null);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const [categorySelect, setCategorySelect] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFile, setExistingFile] = useState<{ name: string; sizeLabel: string } | null>(null);
  const [existingFileRemoved, setExistingFileRemoved] = useState(false);
  const [residents, setResidents] = useState<RecipientOption[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  const clearDisplayedFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (selectedFile) {
      setSelectedFile(null);
    } else {
      setExistingFileRemoved(true);
    }
    touch("file");
  };

  const categoryOptions = useMemo(() => buildDocumentCategoryOptions(), []);

  const resolvedCategory = resolveDocumentCategory(categorySelect, customCategoryInput);
  const formFields = { ...form, category: resolvedCategory };
  const keptExistingFile = Boolean(editingId && existingFile?.name && !existingFileRemoved);
  const hasFile = Boolean(selectedFile) || keptExistingFile;
  const draftErrors = useMemo(
    () => validateDocumentForm(formFields, { hasFile, publishing: false, file: selectedFile }),
    [form, resolvedCategory, selectedFile, editingId, existingFileRemoved, existingFile],
  );
  const publishErrors = useMemo(
    () => validateDocumentForm(formFields, { hasFile, publishing: true, file: selectedFile }),
    [form, resolvedCategory, selectedFile, editingId, existingFileRemoved, existingFile],
  );
  const liveErrors = form.publication_status === "draft" ? draftErrors : publishErrors;

  const load = async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    try {
      const res = await fetchAdminDocuments();
      setDocuments(res.data);
      setPageError(null);
    } catch (err) {
      setPageError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startTransition(() => setPage(1));
  }, [search, filterCat, docTab]);

  const categoryScoped = useMemo(
    () => documents.filter((d) => documentMatchesCategory(d.category, filterCat)),
    [documents, filterCat],
  );

  const tabCounts = useMemo(() => ({
    all: categoryScoped.length,
    published: categoryScoped.filter(isPublishedDocument).length,
    archived: categoryScoped.filter(isArchivedDocument).length,
  }), [categoryScoped]);

  const filtered = useMemo(() => categoryScoped.filter((d) => {
    const matchTab = docTab === "all"
      || (docTab === "published" && isPublishedDocument(d))
      || (docTab === "archived" && isArchivedDocument(d));
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      d.title.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  }), [categoryScoped, search, docTab]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / DOCUMENTS_PAGE_SIZE));
  const pagedDocuments = useMemo(() => {
    const safePage = Math.min(page, lastPage);
    const start = (safePage - 1) * DOCUMENTS_PAGE_SIZE;
    return filtered.slice(start, start + DOCUMENTS_PAGE_SIZE);
  }, [filtered, page, lastPage]);

  const documentStats = useMemo(() => ({
    total: documents.length,
    published: documents.filter(isPublishedDocument).length,
    archived: documents.filter(isArchivedDocument).length,
    recent: documents.filter((doc) => uploadedWithinLastDays(doc, 30)).length,
  }), [documents]);

  const tableTitle = docTab === "published"
    ? "Published"
    : docTab === "archived"
      ? "Archived"
      : "All Documents";

  const openCreate = () => {
    setForm(emptyForm);
    setSelectedFile(null);
    setExistingFile(null);
    setExistingFileRemoved(false);
    setEditingId(null);
    setEditingPublication(null);
    setViewing(null);
    setCategorySelect("");
    setCustomCategoryInput("");
    setShowForm(true);
    void fetchAgreementOptions().then((options) => setResidents(options.residents)).catch(() => setResidents([]));
  };

  const fillEditForm = (doc: CommunityDocument, keepFile = false) => {
    const split = splitDocumentCategory(doc.category);
    setCategorySelect(split.selection);
    setCustomCategoryInput(split.customName);
    if (!keepFile) {
      setSelectedFile(null);
      setExistingFileRemoved(false);
    }
    setExistingFile(doc.file_name ? {
      name: doc.file_name,
      sizeLabel: doc.file_size_label || formatFileSize(doc.file_size),
    } : null);
    setEditingId(doc.id);
    setEditingPublication(doc.publication_status === "draft" ? "draft" : "published");
    setForm({
      title: doc.title,
      category: doc.category,
      description: doc.description ?? "",
      status: doc.status,
      signature_required: false,
      due_at: "",
      assignment_scope: doc.assignment_scope === "residents" ? "residents" : "all",
      notify: false,
      expires_at: "",
      user_ids: (doc.recipients ?? []).map((person) => person.user_id),
    });
  };

  const openEdit = (doc: CommunityDocument) => {
    setViewing(null);
    fillEditForm(doc);
    setShowForm(true);
    void fetchAgreementOptions().then((options) => setResidents(options.residents)).catch(() => setResidents([]));
    void fetchDocument(doc.id).then((full) => fillEditForm(full, true)).catch(() => undefined);
  };

  const openView = async (doc: CommunityDocument) => {
    setViewing(doc);
    try {
      setViewing(await fetchDocument(doc.id));
    } catch {
      setViewing(doc);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingPublication(null);
    setForm(emptyForm);
    setSelectedFile(null);
    setExistingFile(null);
    setExistingFileRemoved(false);
    setCategorySelect("");
    setCustomCategoryInput("");
    resetTouched();
  };

  const setF = (k: keyof DocumentForm, v: DocumentForm[keyof DocumentForm]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    touch(String(k));
    clearError(String(k));
  };

  const handleSubmit = async (publication: "draft" | "published") => {
    const errors = publication === "published" ? publishErrors : draftErrors;
    if (!validateOnSubmit(errors)) return;

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        category: resolvedCategory,
        publication_status: publication,
        signature_required: false,
        due_at: "",
        expires_at: "",
        notify: false,
      };
      if (editingId) {
        await updateDocument(editingId, payload, selectedFile, { removeFile: existingFileRemoved });
        toastSuccess(publication === "draft" ? "Draft saved" : "Document published");
      } else {
        await createDocument(payload, selectedFile!);
        toastSuccess(publication === "draft" ? "Draft saved" : "Document published");
      }
      closeForm();
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const sendReminders = async (doc: CommunityDocument) => {
    try {
      const result = await remindDocument(doc.id);
      toastSuccess(result.sent ? `Reminders sent: ${result.sent}` : "No pending signatures to remind");
      await load(true);
      await refreshViewing(doc.id);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const refreshViewing = async (id: number) => {
    if (viewing?.id === id) setViewing(await fetchDocument(id));
  };

  const handleArchive = async (doc: CommunityDocument) => {
    const ok = await confirmAction({
      title: "Archive Document?",
      text: "Are you sure you want to archive this document? It will be removed from residents' view and can be restored later.",
      confirmText: "Archive",
      icon: "warning",
      color: "amber",
    });
    if (!ok.isConfirmed) return;
    try {
      await archiveDocument(doc.id);
      toastSuccess("Document archived");
      await load(true);
      await refreshViewing(doc.id);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleRestore = async (doc: CommunityDocument) => {
    try {
      await restoreDocument(doc.id);
      toastSuccess("Document restored");
      await load(true);
      await refreshViewing(doc.id);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const openExtend = (doc: CommunityDocument) => {
    setDeadlineDraft(dueAtForInput(doc.due_at));
    setExtending(doc);
  };

  const saveDeadline = async () => {
    if (!extending) return;
    if (!deadlineDraft || new Date(deadlineDraft).getTime() <= Date.now()) {
      toastError("Choose a future signature deadline.");
      return;
    }
    setSubmitting(true);
    try {
      await extendDocumentDeadline(extending.id, new Date(deadlineDraft).toISOString());
      toastSuccess("Signature deadline updated");
      const id = extending.id;
      setExtending(null);
      await load(true);
      await refreshViewing(id);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc: CommunityDocument) => {
    const ok = await confirmDelete({
      title: "Delete Document?",
      text: "Are you sure you want to delete this document? It will be permanently removed and cannot be restored.",
    });
    if (!ok.isConfirmed) return;
    try {
      await deleteDocument(doc.id);
      toastSuccess("Document deleted");
      if (viewing?.id === doc.id) setViewing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (pageError && !documents.length) {
    return <PageError message={pageError} onRetry={() => { setPageError(null); void load(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="nl-eyebrow">Community Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Documents & Agreements</h2>
          <p className="mt-1 text-sm text-slate-500">
            {section === "documents"
              ? "Upload and organize community documents by category. Residents can browse and download from the mobile app."
              : "Create and share agreements with residents to establish community rules, policies, and responsibilities, and collect their signatures for acknowledgment and consent."}
          </p>
        </div>
        {section === "documents" ? (
          <button type="button" onClick={openCreate} className="nl-btn-primary shrink-0">
            <FilePlus className="h-4 w-4" strokeWidth={2.25} />
            Add Document
          </button>
        ) : (
          <button type="button" onClick={() => openAgreementCreate.current?.()} className="nl-btn-primary shrink-0">
            <PenLine className="h-4 w-4" strokeWidth={2.25} />
            Create Agreement
          </button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Documents and agreements">
        {([
          { key: "documents" as const, label: "Documents", icon: FileText },
          { key: "agreements" as const, label: "Agreements", icon: PenLine },
        ]).map((tab) => {
          const active = section === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => showSection(tab.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${active ? "bg-[#1B4F8A] text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-md ${active ? "bg-white/15 text-white" : "bg-white text-[#1B4F8A] shadow-sm"}`}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === "agreements" ? (
        <AgreementsPanel initialId={openAgreementId} openCreateRef={openAgreementCreate} />
      ) : null}
      {section === "documents" ? (
      <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <StatTile label="Total Documents" value={String(documentStats.total)} hint="Uploaded documents" tone="blue" icon={<FileText className="h-5 w-5" />} />
        <StatTile label="Published" value={String(documentStats.published)} hint="Available to residents" tone="green" icon={<FolderOpen className="h-5 w-5" />} />
        <StatTile label="Archived" value={String(documentStats.archived)} hint="No longer published" tone="slate" icon={<Archive className="h-5 w-5" />} />
        <StatTile label="Recently Added" value={String(documentStats.recent)} hint="Uploaded in the last 30 days" tone="violet" icon={<Clock3 className="h-5 w-5" />} />
      </div>

        <DataTable
          title={tableTitle}
          search={search}
          filters={[
            { key: "all", label: "All Documents", count: tabCounts.all, icon: <Files strokeWidth={2.25} /> },
            { key: "published", label: "Published", count: tabCounts.published, icon: <BadgeCheck strokeWidth={2.25} /> },
            { key: "archived", label: "Archived", count: tabCounts.archived, icon: <Archive strokeWidth={2.25} /> },
          ]}
          activeFilter={docTab}
          onFilter={(key) => startTransition(() => setDocTab(key))}
          onSearch={(value) => startTransition(() => setSearch(value))}
          searchPlaceholder="Search title, category…"
          searchClassName="min-w-0 w-full sm:w-56"
          beforeSearch={
            <div className="w-52 shrink-0">
              <ThemedSelect
                value={filterCat}
                placeholder="All categories"
                options={[
                  { value: "all", label: "All categories" },
                  ...DOCUMENT_PRESET_CATEGORIES.map((name) => ({ value: name, label: name })),
                  { value: DOCUMENT_OTHER_CATEGORY, label: DOCUMENT_OTHER_CATEGORY },
                ]}
                onChange={(value) => startTransition(() => setFilterCat(value))}
              />
            </div>
          }
          loading={adminTableBusy(refreshing, submitting, isPending)}
          contained
          isEmpty={filtered.length === 0}
          empty={
            documents.length === 0
              ? "No Documents Added Yet"
              : search || filterCat !== "all"
                ? "No documents match your filters."
                : "No documents yet. Click \"Add Document\" to upload your first file."
          }
        >
          <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-3 pl-5 pr-4 font-semibold">Document Title</th>
                  <th className="px-4 py-3 font-semibold">Assigned To</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="py-3 pl-4 pr-5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedDocuments.map((doc) => {
                  const badge = statusBadge(doc);
                  const StatusIcon = statusIcon(badge.label);
                  const kind = documentKind(doc);
                  const KindIcon = kind === "image" ? ImageIcon : FileText;
                  const life = documentLifecycle(doc);
                  const summary = doc.signature_summary;
                  const openSignatures = (summary?.pending ?? 0) + (summary?.overdue ?? 0);
                  const requiredCount = summary?.required ?? 0;
                  const signedCount = summary?.signed ?? 0;
                  const fullySigned = requiredCount !== 0 && signedCount === requiredCount;
                  const partial = Boolean(doc.signature_required && signedCount !== 0 && signedCount !== requiredCount);
                  return (
                  <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="max-w-0 overflow-hidden py-3 pl-5 pr-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${DOCUMENT_KIND_STYLE[kind]}`} aria-hidden>
                          <KindIcon className="h-4 w-4" strokeWidth={2.25} />
                        </span>
                        <div className="min-w-0">
                          <div className="w-fit max-w-[min(32ch,100%)] truncate font-semibold text-slate-900" title={doc.title}>{doc.title}</div>
                          <div className="truncate text-xs text-slate-400" title={`${fileTypeLabel(doc)} · ${doc.file_size_label} · ${doc.category}`}>{fileTypeLabel(doc)} · {doc.file_size_label} · {doc.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2.25} aria-hidden />
                        {assignedLabel(doc)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <AdminBadge tone={badge.tone}>
                        <StatusIcon className="mr-1 h-3 w-3" strokeWidth={2.25} aria-hidden />
                        {badge.label}
                      </AdminBadge>
                      {partial ? <p className="mt-1 text-[11px] text-slate-400">{signedCount} of {requiredCount} signed</p> : null}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-4 pr-5 text-right">
                      <AdminActionsMenu
                        actions={[
                          { label: "View Details", icon: "view", onClick: () => void openView(doc) },
                          { label: "Download", icon: "download", onClick: () => { window.open(doc.file_url, "_blank", "noopener,noreferrer"); } },
                          { label: "Edit", icon: "edit", onClick: () => openEdit(doc) },
                          { label: "Send Reminder", icon: "escalate", hidden: !doc.signature_required || life === "draft" || life === "archived" || openSignatures === 0, onClick: () => void sendReminders(doc) },
                          { label: "Extend Deadline", icon: "edit", hidden: !doc.signature_required || life === "draft" || life === "archived" || fullySigned, onClick: () => openExtend(doc) },
                          { label: "Archive", icon: "ban", tone: "warning", hidden: life === "draft" || life === "archived", onClick: () => void handleArchive(doc) },
                          { label: "Restore", icon: "check", tone: "success", hidden: life !== "archived", onClick: () => void handleRestore(doc) },
                          { label: "Delete", icon: "delete", tone: "danger", onClick: () => handleDelete(doc) },
                        ]}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          <DtPagination
            showing={pagedDocuments.length}
            total={filtered.length}
            page={Math.min(page, lastPage)}
            lastPage={lastPage}
            onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
            pageSize={DOCUMENTS_PAGE_SIZE}
          />
        </DataTable>
      </div>
      ) : null}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="document-details-title">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#1B4F8A]">Document</p>
                  <h3 id="document-details-title" className="mt-1 text-lg font-bold text-slate-900">View Details</h3>
                </div>
                <button type="button" onClick={() => setViewing(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-2">
              <dl className="divide-y divide-slate-100">
                {viewing.title?.trim() ? <DetailField label="Title">{viewing.title}</DetailField> : null}
                {viewing.description?.trim() ? (
                  <DetailField label="Description">
                    <span className="whitespace-pre-wrap">{viewing.description.trim()}</span>
                  </DetailField>
                ) : null}
                {viewing.category?.trim() ? <DetailField label="Category">{viewing.category}</DetailField> : null}
                {viewing.file_name ? (
                  <DetailField label="File">
                    <p className="font-medium text-slate-900">{viewing.file_name}</p>
                    {[fileTypeLabel(viewing), viewing.file_size_label].filter(Boolean).length ? (
                      <p className="text-slate-500">{[fileTypeLabel(viewing), viewing.file_size_label].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </DetailField>
                ) : null}
                <DetailField label="Assigned To">
                  {viewing.assignment_scope === "residents" ? (
                    assignedResidentNames(viewing).length ? (
                      <span>{assignedResidentNames(viewing).join(", ")}</span>
                    ) : (
                      "Specific Residents"
                    )
                  ) : (
                    "All Residents"
                  )}
                </DetailField>
                <DetailField label="Status">
                  <AdminBadge tone={publicationStatus(viewing).tone}>{publicationStatus(viewing).label}</AdminBadge>
                </DetailField>
                {formatUploadedDate(viewing.created_at) ? (
                  <DetailField label="Uploaded Date">{formatUploadedDate(viewing.created_at)}</DetailField>
                ) : null}
              </dl>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={() => setViewing(null)} className="nl-btn-secondary">
                <X className="h-4 w-4" strokeWidth={2.25} />
                Close
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {viewing.signature_required && (viewing.stats?.pending || viewing.stats?.overdue) ? (
                  <button type="button" onClick={() => void sendReminders(viewing)} className="nl-btn-secondary">
                    <Bell className="h-4 w-4" strokeWidth={2.25} />
                    Send reminders
                  </button>
                ) : null}
                <a href={viewing.file_url} target="_blank" rel="noopener noreferrer" className="nl-btn-primary inline-flex items-center gap-1.5">
                  <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
                  Open File
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {extending ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Extend deadline</h3>
            <p className="mt-1 text-sm text-slate-500">The new signature deadline applies to residents who have not signed {extending.title}.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ThemedDatePicker
                label="Deadline date"
                placeholder="Select date"
                value={deadlineDraft.slice(0, 10)}
                min={localDateTimeValue(new Date()).slice(0, 10)}
                onChange={(value) => {
                  const time = deadlineDraft.slice(11, 16) || "23:59";
                  setDeadlineDraft(value ? `${value}T${time}` : "");
                }}
              />
              <ThemedTimePicker
                label="Deadline time"
                placeholder="Select time"
                value={deadlineDraft.slice(11, 16)}
                minTime={deadlineDraft.slice(0, 10) === localDateTimeValue(new Date()).slice(0, 10) ? localDateTimeValue(new Date()).slice(11, 16) : undefined}
                onChange={(value) => {
                  const date = deadlineDraft.slice(0, 10);
                  if (!date) return;
                  setDeadlineDraft(`${date}T${value}`);
                }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setExtending(null)} className="nl-btn-secondary">
                <X className="h-4 w-4" strokeWidth={2.25} />
                Cancel
              </button>
              <button type="button" disabled={submitting} onClick={() => void saveDeadline()} className="nl-btn-primary">
                <Clock3 className="h-4 w-4" strokeWidth={2.25} />
                Save deadline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-600">{editingId ? "Edit Document" : "New Document"}</p>
                  <h3 className="text-lg font-bold text-slate-900">{editingId ? "Update Document" : "Upload Document"}</h3>
                </div>
                <button type="button" onClick={closeForm} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Title *</label>
                <ClearableInput
                  className={inputClass(showError("title", liveErrors), "nl-input")}
                  value={form.title}
                  maxLength={200}
                  onChange={(e) => setF("title", e.target.value)}
                  onBlur={() => touch("title")}
                  placeholder="e.g. Community Rules & Bylaws"
                />
                {showError("title", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("title", liveErrors)}</p>
                ) : null}
                <CharCount value={form.title} max={200} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Category *</label>
                <ThemedSelect
                  value={categorySelect}
                  placeholder="Select category…"
                  error={showError("category", liveErrors) || undefined}
                  options={categoryOptions.map((c) => ({ value: c, label: c }))}
                  onChange={(value) => {
                    setCategorySelect(value);
                    touch("category");
                    clearError("category");
                    if (value !== DOCUMENT_OTHER_CATEGORY) {
                      setCustomCategoryInput("");
                      setF("category", value);
                    } else {
                      setF("category", "");
                    }
                  }}
                />
                {categorySelect === DOCUMENT_OTHER_CATEGORY ? (
                  <ClearableInput
                    type="text"
                    className={inputClass(showError("category", liveErrors), "nl-input mt-2 w-full")}
                    placeholder="Enter custom category name"
                    value={customCategoryInput}
                    onChange={(e) => {
                      setCustomCategoryInput(e.target.value);
                      setF("category", e.target.value);
                      touch("category");
                      clearError("category");
                    }}
                    autoFocus
                  />
                ) : null}
                {showError("category", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("category", liveErrors)}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Description</label>
                <ClearableTextarea
                  className={inputClass(showError("description", liveErrors), "nl-input min-h-[80px] resize-none overflow-y-auto")}
                  style={{ resize: "none" }}
                  value={form.description}
                  maxLength={5000}
                  rows={3}
                  onChange={(e) => setF("description", e.target.value)}
                  onBlur={() => touch("description")}
                  placeholder="Optional notes about this document"
                />
                {showError("description", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("description", liveErrors)}</p>
                ) : null}
                <CharCount value={form.description} max={5000} />
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">Assigned To *</p>
                <div className="space-y-2">
                  {(["all", "residents"] as const).map((scope) => (
                    <label key={scope} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm ${editingPublication === "published" ? "cursor-default opacity-70" : "cursor-pointer"} ${form.assignment_scope === scope ? "border-[#1B4F8A] bg-[#F4F8FC]" : "border-slate-200"}`}>
                      <input type="radio" disabled={editingPublication === "published"} checked={form.assignment_scope === scope} onChange={() => setF("assignment_scope", scope)} />
                      <span className="font-medium text-slate-800">{scope === "all" ? "All Residents" : "Specific Residents"}</span>
                    </label>
                  ))}
                </div>
                {form.assignment_scope === "residents" ? (
                  <>
                    <ResidentMultiSelect
                      residents={residents}
                      selectedIds={form.user_ids ?? []}
                      disabled={editingPublication === "published"}
                      error={showError("user_ids", publishErrors)}
                      onChange={(ids) => setF("user_ids", ids)}
                    />
                    {showError("user_ids", publishErrors) ? <p className="mt-1 text-xs text-red-600">{showError("user_ids", publishErrors)}</p> : null}
                  </>
                ) : null}
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">{keptExistingFile ? "Replace File (optional)" : "File *"}</label>
                <ClearableInput ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); touch("file"); clearError("file"); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className={inputClass(showError("file", liveErrors), "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50/50")}>
                  <Upload className="h-4 w-4" />
                  {selectedFile || keptExistingFile ? "Choose a new file to replace" : "Choose PDF, Word, or image file (max 10 MB)"}
                </button>
                {selectedFile ? (
                  <FileChoicePreview
                    name={selectedFile.name}
                    sizeLabel={formatFileSize(selectedFile.size)}
                    onRemove={clearDisplayedFile}
                  />
                ) : keptExistingFile && existingFile ? (
                  <FileChoicePreview
                    name={existingFile.name}
                    sizeLabel={existingFile.sizeLabel}
                    onRemove={clearDisplayedFile}
                  />
                ) : null}
                {showError("file", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("file", liveErrors)}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={submitting} className="nl-btn-secondary">
                <X className="h-4 w-4" strokeWidth={2.25} />
                Close
              </button>
              <button type="button" onClick={() => void handleSubmit("published")} disabled={submitting || hasFieldErrors(editingPublication === "published" ? draftErrors : publishErrors)} className="nl-btn-primary disabled:opacity-60">
                {editingPublication === "published" ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} /> : <BadgeCheck className="h-4 w-4" strokeWidth={2.25} />}
                {submitting ? "Saving…" : editingPublication === "published" ? "Save changes" : "Publish Document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
