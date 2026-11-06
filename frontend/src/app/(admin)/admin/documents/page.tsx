"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  Layers,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { CharCount } from "@/components/admin/char-count";
import { AgreementsPanel } from "@/components/admin/agreements-panel";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmDelete, toastError, toastSuccess } from "@/lib/alert";
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
  createDocument,
  deleteDocument,
  fetchAdminDocuments,
  updateDocument,
  type CommunityDocument,
  type DocumentForm,
} from "@/lib/api/documents";

const DOCUMENTS_PAGE_SIZE = 6;

const emptyForm: DocumentForm = {
  title: "",
  category: "",
  description: "",
  status: "active",
  file: null,
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<CommunityDocument | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const [categorySelect, setCategorySelect] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  const categoryOptions = useMemo(() => buildDocumentCategoryOptions(), []);

  const resolvedCategory = resolveDocumentCategory(categorySelect, customCategoryInput);
  const liveErrors = useMemo(
    () => validateDocumentForm({ ...form, category: resolvedCategory }, { hasFile: Boolean(selectedFile) || Boolean(editingId) }),
    [form, resolvedCategory, selectedFile, editingId],
  );
  const canSubmitForm = !hasFieldErrors(liveErrors);

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
  }, [search, filterCat]);

  const categoryScoped = useMemo(
    () => documents.filter((d) => documentMatchesCategory(d.category, filterCat)),
    [documents, filterCat],
  );

  const filtered = useMemo(() => categoryScoped.filter((d) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      d.title.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q);
    return matchSearch;
  }), [categoryScoped, search]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / DOCUMENTS_PAGE_SIZE));
  const pagedDocuments = useMemo(() => {
    const safePage = Math.min(page, lastPage);
    const start = (safePage - 1) * DOCUMENTS_PAGE_SIZE;
    return filtered.slice(start, start + DOCUMENTS_PAGE_SIZE);
  }, [filtered, page, lastPage]);

  const stats = useMemo(() => ({
    total: documents.length,
    active: documents.filter((d) => d.status === "active").length,
    categoryCount: DOCUMENT_PRESET_CATEGORIES.length + 1,
  }), [documents]);

  const tableTitle = "All Documents";

  const openCreate = () => {
    setForm(emptyForm);
    setSelectedFile(null);
    setEditingId(null);
    setViewing(null);
    setCategorySelect("");
    setCustomCategoryInput("");
    setShowForm(true);
  };

  const openEdit = (doc: CommunityDocument) => {
    setViewing(null);
    setForm({
      title: doc.title,
      category: doc.category,
      description: doc.description ?? "",
      status: doc.status,
    });
    const split = splitDocumentCategory(doc.category);
    setCategorySelect(split.selection);
    setCustomCategoryInput(split.customName);
    setSelectedFile(null);
    setEditingId(doc.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSelectedFile(null);
    setCategorySelect("");
    setCustomCategoryInput("");
    resetTouched();
  };

  const setF = (k: keyof DocumentForm, v: DocumentForm[keyof DocumentForm]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    touch(String(k));
    clearError(String(k));
  };

  const handleSubmit = async () => {
    if (!validateOnSubmit(liveErrors)) return;

    setSubmitting(true);
    try {
      const payload = { ...form, category: resolvedCategory };
      if (editingId) {
        await updateDocument(editingId, payload, selectedFile);
        toastSuccess("Document updated");
      } else {
        await createDocument(payload, selectedFile!);
        toastSuccess("Document uploaded");
      }
      closeForm();
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc: CommunityDocument) => {
    const ok = await confirmDelete({
      title: `Delete "${doc.title}"?`,
      text: "This will permanently remove the file.",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Documents & Agreements</h2>
          <p className="mt-1 text-sm text-slate-500">
            {section === "documents"
              ? "Upload and organize community documents by category. Residents can browse and download from the mobile app."
              : "Send agreements for signature and track pending, signed, overdue, and expired records."}
          </p>
        </div>
        {section === "documents" ? (
          <button type="button" onClick={openCreate} className="nl-btn-primary">
            <Plus className="h-4 w-4" />
            Add Document
          </button>
        ) : (
          <button type="button" onClick={() => openAgreementCreate.current?.()} className="nl-btn-primary">
            <Plus className="h-4 w-4" />
            Create Agreement
          </button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Documents and agreements">
        <button
          type="button"
          role="tab"
          aria-selected={section === "documents"}
          onClick={() => showSection("documents")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${section === "documents" ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-white"}`}
        >
          Documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "agreements"}
          onClick={() => showSection("agreements")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${section === "agreements" ? "bg-[#1B4F8A] text-white" : "text-slate-600 hover:bg-white"}`}
        >
          Agreements
        </button>
      </div>

      {section === "agreements" ? (
        <AgreementsPanel initialId={openAgreementId} openCreateRef={openAgreementCreate} />
      ) : null}
      {section === "documents" ? (
      <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total Documents" value={String(stats.total)} hint="All files" tone="blue" icon={<FileText className="h-5 w-5" />} />
        <StatTile label="Active" value={String(stats.active)} hint="Visible to residents" tone="green" icon={<FolderOpen className="h-5 w-5" />} />
        <StatTile label="Categories" value={String(stats.categoryCount)} hint="Document groups" tone="violet" icon={<Layers className="h-5 w-5" />} />
      </div>

        <DataTable
          title={tableTitle}
          totalCount={categoryScoped.length}
          visibleCount={filtered.length}
          search={search}
          onSearch={(value) => startTransition(() => setSearch(value))}
          searchPlaceholder="Search title, category…"
          searchClassName="min-w-0 w-full sm:w-56"
          beforeSearch={
            <div className="relative shrink-0">
              <select
                aria-label="Category"
                value={filterCat}
                onChange={(event) => startTransition(() => setFilterCat(event.target.value))}
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
          loading={adminTableBusy(refreshing, submitting, isPending)}
          isEmpty={filtered.length === 0}
          empty={search || filterCat !== "all" ? "No documents match your filters." : "No documents yet. Click \"Add Document\" to upload your first file."}
        >
          <div className="max-h-[min(680px,calc(100vh-16rem))] overflow-y-auto">
            <div className="space-y-3 p-4">
              {pagedDocuments.map((doc) => (
                <article key={doc.id} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-md">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[15px] font-semibold text-slate-900">{doc.title}</h4>
                        <AdminBadge tone={doc.status === "active" ? "green" : "slate"}>{doc.status === "active" ? "Active" : "Inactive"}</AdminBadge>
                      </div>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                        <Layers className="h-3 w-3" />{doc.category}
                      </p>
                      {doc.description ? <p className="mt-2 text-sm text-slate-600 line-clamp-2">{doc.description}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>{doc.file_size_label} · {doc.file_name}</span>
                        <span>Updated {formatDate(doc.updated_at)}</span>
                        <span className="inline-flex items-center gap-1"><Download className="h-3 w-3" />{doc.download_count} downloads</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1 sm:flex-col sm:items-stretch">
                      <AdminActionsMenu
                        actions={[
                          { label: "View", icon: "view", onClick: () => setViewing(doc) },
                          {
                            label: "Download",
                            icon: "download",
                            onClick: () => {
                              window.open(doc.file_url, "_blank", "noopener,noreferrer");
                            },
                          },
                          { label: "Edit", icon: "edit", onClick: () => openEdit(doc) },
                          { label: "Delete", icon: "delete", tone: "danger", onClick: () => handleDelete(doc) },
                        ]}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
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
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <AdminBadge tone={viewing.status === "active" ? "green" : "slate"}>{viewing.status === "active" ? "Active" : "Inactive"}</AdminBadge>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{viewing.title}</h3>
                  <p className="mt-1 text-sm font-medium text-blue-600">{viewing.category}</p>
                </div>
                <button type="button" onClick={() => setViewing(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-700">
                <p><span className="font-semibold">File:</span> {viewing.file_name}</p>
                <p className="mt-1"><span className="font-semibold">Size:</span> {viewing.file_size_label}</p>
                <p className="mt-1"><span className="font-semibold">Downloads:</span> {viewing.download_count}</p>
              </div>
              {viewing.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{viewing.description}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={() => setViewing(null)} className="nl-btn-secondary">Close</button>
              <a href={viewing.file_url} target="_blank" rel="noopener noreferrer" className="nl-btn-primary inline-flex items-center gap-1.5"><Download className="h-3.5 w-3.5" />Open File</a>
              <button type="button" onClick={() => openEdit(viewing)} className="nl-btn-primary inline-flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" />Edit</button>
            </div>
          </div>
        </div>
      )}

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
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Description *</label>
                <ClearableTextarea
                  className={inputClass(showError("description", liveErrors), "nl-input min-h-[80px] resize-none overflow-y-auto")}
                  style={{ resize: "none" }}
                  value={form.description}
                  maxLength={5000}
                  rows={4}
                  onChange={(e) => setF("description", e.target.value)}
                  onBlur={() => touch("description")}
                  placeholder="Describe this document for residents"
                />
                {showError("description", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("description", liveErrors)}</p>
                ) : null}
                <CharCount value={form.description} max={5000} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">{editingId ? "Replace File (optional)" : "File *"}</label>
                <ClearableInput ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); touch("file"); clearError("file"); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className={inputClass(showError("file", liveErrors), "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50/50")}>
                  <Upload className="h-4 w-4" />
                  {selectedFile ? selectedFile.name : editingId ? "Choose a new file to replace" : "Choose PDF, Word, or image file (max 10 MB)"}
                </button>
                {showError("file", liveErrors) ? (
                  <p className="mt-1 text-xs text-red-600">{showError("file", liveErrors)}</p>
                ) : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <ClearableInput type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" checked={form.status === "active"} onChange={(e) => setF("status", e.target.checked ? "active" : "inactive")} />
                Active (visible to residents)
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={submitting} className="nl-btn-secondary">Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={submitting || !canSubmitForm} className="nl-btn-primary disabled:opacity-60">
                {submitting ? "Saving…" : editingId ? "Save Changes" : "Upload Document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
