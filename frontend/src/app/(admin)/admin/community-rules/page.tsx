"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FolderOpen,
  Info,
  Layers,
  Pencil,
  Plus,
  Scale,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AdminBadge, DataTable, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import {
  createRule,
  createRuleCategory,
  deleteRule,
  deleteRuleCategory,
  fetchAdminRules,
  updateRule,
  type CommunityRule,
  type RuleCategory,
  type RuleForm,
} from "@/lib/api/community-rules";
import { validateCommunityRuleForm } from "@/lib/admin/community-rule-form-validation";
import {
  RULE_OTHER_CATEGORY,
  buildCategoryOptions,
  resolveRuleCategory,
  splitRuleCategory,
} from "@/lib/admin/community-rule-categories";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { adminTableBusy } from "@/lib/admin/table-loading";

/* ── constants ─────────────────────────────────────────────── */
const RULES_PAGE_SIZE = 6;
const SEVERITY_META = {
  important: {
    label: "Important",
    tone: "red" as const,
    badge: "bg-red-50 text-red-700 border-red-200",
    accent: "#dc2626",
    bg: "bg-red-50",
    icon: ShieldAlert,
  },
  standard: {
    label: "Standard",
    tone: "amber" as const,
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    accent: "#d97706",
    bg: "bg-amber-50",
    icon: AlertTriangle,
  },
  info: {
    label: "Info",
    tone: "slate" as const,
    badge: "bg-slate-50 text-slate-600 border-slate-200",
    accent: "#64748b",
    bg: "bg-slate-50",
    icon: Info,
  },
} as const;

const emptyForm: RuleForm = {
  title: "",
  category: "",
  description: "",
  severity: "standard",
  requires_acknowledgment: false,
  status: "active",
};

type StatusFilter = "all" | "active" | "inactive";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── component ──────────────────────────────────────────────── */
export default function CommunityRulesPage() {
  const [rules, setRules] = useState<CommunityRule[]>([]);
  const [categories, setCategories] = useState<RuleCategory[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterSev, setFilterSev] = useState("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<CommunityRule | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [categorySelect, setCategorySelect] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories.map((c) => c.name)),
    [categories],
  );

  const resolvedCategory = resolveRuleCategory(categorySelect, customCategoryInput);
  const liveErrors = useMemo(
    () => validateCommunityRuleForm({ ...form, category: resolvedCategory }),
    [form, resolvedCategory],
  );
  const canSubmitForm = !hasFieldErrors(liveErrors);

  const load = async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    try {
      const res = await fetchAdminRules();
      setRules(res.data);
      setCategories(res.categories);
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
  }, [search, filterCat, filterSev, filterStatus]);

  /** Rules limited by selected category only (before search/status/severity). */
  const categoryScoped = useMemo(
    () => (filterCat === "all" ? rules : rules.filter((r) => r.category === filterCat)),
    [rules, filterCat],
  );

  const filtered = useMemo(() => categoryScoped.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q);
    const matchSev = filterSev === "all" || r.severity === filterSev;
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && r.status === "active") ||
      (filterStatus === "inactive" && r.status === "inactive");
    return matchSearch && matchSev && matchStatus;
  }), [categoryScoped, search, filterSev, filterStatus]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / RULES_PAGE_SIZE));
  const pagedRules = useMemo(() => {
    const safePage = Math.min(page, lastPage);
    const start = (safePage - 1) * RULES_PAGE_SIZE;
    return filtered.slice(start, start + RULES_PAGE_SIZE);
  }, [filtered, page, lastPage]);

  const stats = useMemo(() => {
    const active = rules.filter((r) => r.status === "active").length;
    const ackRequired = rules.filter((r) => r.requires_acknowledgment).length;
    const totalAcks = rules.reduce((sum, r) => sum + (r.acknowledgment_count ?? 0), 0);
    return {
      total: rules.length,
      active,
      ackRequired,
      categoryCount: categories.length,
      totalAcks,
      inactive: rules.length - active,
    };
  }, [rules, categories]);

  const severityFilters = useMemo(() => [
    { key: "all", label: "All", count: categoryScoped.length },
    { key: "important", label: "Important", count: categoryScoped.filter((r) => r.severity === "important").length },
    { key: "standard", label: "Standard", count: categoryScoped.filter((r) => r.severity === "standard").length },
    { key: "info", label: "Info", count: categoryScoped.filter((r) => r.severity === "info").length },
  ], [categoryScoped]);

  const statusFilters = useMemo(() => {
    const active = categoryScoped.filter((r) => r.status === "active").length;
    const inactive = categoryScoped.length - active;
    return [
      { key: "all", label: "All", count: categoryScoped.length },
      { key: "active", label: "Active", count: active },
      { key: "inactive", label: "Inactive", count: inactive },
    ];
  }, [categoryScoped]);

  const tableTitle = filterCat === "all" ? "All Rules" : filterCat;

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setCategorySelect("");
    setCustomCategoryInput("");
    setShowForm(true);
  };

  const openEdit = (rule: CommunityRule) => {
    setViewing(null);
    setForm({
      title: rule.title,
      category: rule.category,
      description: rule.description,
      severity: rule.severity,
      requires_acknowledgment: rule.requires_acknowledgment,
      status: rule.status,
    });
    setEditingId(rule.id);
    const split = splitRuleCategory(rule.category, categories.map((c) => c.name));
    setCategorySelect(split.selection);
    setCustomCategoryInput(split.customName);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setCategorySelect("");
    setCustomCategoryInput("");
    resetTouched();
  };

  const setF = (k: keyof RuleForm, v: RuleForm[keyof RuleForm]) => {
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
        await updateRule(editingId, payload);
        toastSuccess("Rule updated");
      } else {
        await createRule(payload);
        toastSuccess("Rule created");
      }
      closeForm();
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rule: CommunityRule) => {
    const ok = await confirmDelete({
      title: `Delete "${rule.title}"?`,
      text: "This will remove the rule and all resident acknowledgments.",
    });
    if (!ok.isConfirmed) return;
    try {
      await deleteRule(rule.id);
      toastSuccess("Rule deleted");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      toastError("Enter a category name.");
      return;
    }
    setSavingCategory(true);
    try {
      await createRuleCategory(name);
      toastSuccess("Category added");
      setNewCategoryName("");
      setShowCategoryForm(false);
      await load();
      setFilterCat(name);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: RuleCategory) => {
    if (cat.count > 0) {
      toastError("Remove or reassign rules in this category before deleting it.");
      return;
    }
    const ok = await confirmDelete({
      title: `Delete category "${cat.name}"?`,
      text: "This removes the empty category from the list.",
    });
    if (!ok.isConfirmed) return;
    try {
      await deleteRuleCategory(cat.name);
      toastSuccess("Category deleted");
      if (filterCat === cat.name) setFilterCat("all");
      await load();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (pageError && !rules.length) {
    return <PageError message={pageError} onRetry={() => { setPageError(null); void load(); }} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Community Rules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Publish guidelines for your community. Rules marked for acknowledgment appear as action items for residents on mobile.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="nl-btn-primary"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Rules"
          value={String(stats.total)}
          hint="All community guidelines"
          tone="blue"
          icon={<BookOpen className="h-5 w-5" />}
        />
        <StatTile
          label="Active Rules"
          value={String(stats.active)}
          hint="Visible to residents"
          tone="green"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatTile
          label="Need Acknowledgment"
          value={String(stats.ackRequired)}
          hint={`${stats.totalAcks} total sign-offs`}
          tone="amber"
          icon={<ClipboardCheck className="h-5 w-5" />}
        />
        <StatTile
          label="Categories"
          value={String(stats.categoryCount)}
          hint="Organized rule groups"
          tone="violet"
          icon={<Layers className="h-5 w-5" />}
        />
      </div>

      {/* Main layout */}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Category sidebar */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Categories
              </p>
              <p className="text-[11px] text-slate-400">Add and filter groups</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => setShowCategoryForm((v) => !v)}
              title="Add category"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {showCategoryForm ? (
            <div className="mb-3 space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
              <ClearableInput
                className="nl-input"
                placeholder="Category name *"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="nl-btn-primary flex-1 disabled:opacity-60"
                  disabled={savingCategory || !newCategoryName.trim()}
                  onClick={handleAddCategory}
                >
                  {savingCategory ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  className="nl-btn-secondary"
                  onClick={() => {
                    setShowCategoryForm(false);
                    setNewCategoryName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => startTransition(() => setFilterCat("all"))}
              className={[
                "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition",
                filterCat === "all"
                  ? "bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-100"
                  : "text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                All Rules
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                {rules.length}
              </span>
            </button>

            {categories.length === 0 ? (
              <p className="px-3 py-4 text-xs leading-relaxed text-slate-400">
                No categories yet. Click + to add one, or create a rule.
              </p>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.name}
                  className={[
                    "group flex w-full items-center gap-1 rounded-xl transition",
                    filterCat === cat.name ? "bg-blue-50 ring-1 ring-blue-100" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => startTransition(() => setFilterCat(cat.name))}
                    className={[
                      "flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition",
                      filterCat === cat.name
                        ? "font-semibold text-blue-700"
                        : "text-slate-700",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight
                        className={[
                          "h-3 w-3 shrink-0 transition-transform",
                          filterCat === cat.name ? "rotate-90 text-blue-600" : "text-slate-400",
                        ].join(" ")}
                      />
                      <span className="truncate">{cat.name}</span>
                    </span>
                    <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                      {cat.count}
                    </span>
                  </button>
                  {cat.count === 0 ? (
                    <button
                      type="button"
                      title={`Delete ${cat.name}`}
                      onClick={() => handleDeleteCategory(cat)}
                      className="mr-2 hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 group-hover:inline-flex"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Rules panel */}
        <DataTable
          title={tableTitle}
          totalCount={categoryScoped.length}
          visibleCount={filtered.length}
          search={search}
          onSearch={(value) => startTransition(() => setSearch(value))}
          searchPlaceholder="Search title, category, description…"
          loading={adminTableBusy(refreshing, submitting, savingCategory, isPending)}
          filters={statusFilters}
          activeFilter={filterStatus}
          onFilter={(key) => startTransition(() => setFilterStatus(key as StatusFilter))}
          secondaryFilters={severityFilters}
          activeSecondary={filterSev}
          onSecondary={(key) => startTransition(() => setFilterSev(key))}
          isEmpty={filtered.length === 0}
          empty={
            search || filterCat !== "all" || filterSev !== "all" || filterStatus !== "all"
              ? "No rules match your filters."
              : "No rules yet. Click \"Add Rule\" to create your first community guideline."
          }
        >
          <div className="max-h-[min(680px,calc(100vh-16rem))] overflow-y-auto">
            <div className="space-y-3 p-4">
            {pagedRules.map((rule) => {
              const sev = SEVERITY_META[rule.severity] ?? SEVERITY_META.info;
              const SevIcon = sev.icon;
              return (
                <article
                  key={rule.id}
                  className={[
                    "group relative overflow-hidden rounded-2xl border bg-white transition duration-200",
                    rule.status === "inactive"
                      ? "border-slate-200 opacity-75"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-md",
                  ].join(" ")}
                >
                  <div
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: sev.accent }}
                  />

                  <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-start">
                    <div
                      className={[
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                        sev.badge,
                      ].join(" ")}
                    >
                      <SevIcon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[15px] font-semibold text-slate-900">{rule.title}</h4>
                        <AdminBadge tone={sev.tone}>{sev.label}</AdminBadge>
                        {rule.requires_acknowledgment && (
                          <AdminBadge tone="blue">
                            <span className="inline-flex items-center gap-1">
                              <ClipboardCheck className="h-3 w-3" />
                              Acknowledgment
                            </span>
                          </AdminBadge>
                        )}
                        {rule.status === "inactive" ? (
                          <AdminBadge tone="slate">Inactive</AdminBadge>
                        ) : (
                          <AdminBadge tone="green">Active</AdminBadge>
                        )}
                      </div>

                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                        <Layers className="h-3 w-3" />
                        {rule.category}
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-2">
                        {rule.description}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Updated {formatDate(rule.updated_at)}</span>
                        {rule.requires_acknowledgment && rule.acknowledgment_count !== undefined && (
                          <span className="inline-flex items-center gap-1 text-blue-500">
                            <Users className="h-3 w-3" />
                            {rule.acknowledgment_count} resident{rule.acknowledgment_count === 1 ? "" : "s"} acknowledged
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1 sm:flex-col sm:items-stretch">
                      <AdminActionsMenu
                        actions={[
                          { label: "View", icon: "view", onClick: () => setViewing(rule) },
                          { label: "Edit", icon: "edit", onClick: () => openEdit(rule) },
                          { label: "Delete", icon: "delete", tone: "danger", onClick: () => handleDelete(rule) },
                        ]}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
            </div>
          </div>
          <DtPagination
            showing={pagedRules.length}
            total={filtered.length}
            page={Math.min(page, lastPage)}
            lastPage={lastPage}
            onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
            pageSize={RULES_PAGE_SIZE}
          />
        </DataTable>
      </div>

      {/* View rule modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/40 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone={SEVERITY_META[viewing.severity]?.tone ?? "slate"}>
                      {SEVERITY_META[viewing.severity]?.label ?? "Info"}
                    </AdminBadge>
                    {viewing.requires_acknowledgment && (
                      <AdminBadge tone="blue">
                        <span className="inline-flex items-center gap-1">
                          <ClipboardCheck className="h-3 w-3" />
                          Acknowledgment
                        </span>
                      </AdminBadge>
                    )}
                    <AdminBadge tone={viewing.status === "active" ? "green" : "slate"}>
                      {viewing.status === "active" ? "Active" : "Inactive"}
                    </AdminBadge>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{viewing.title}</h3>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
                    <Layers className="h-3.5 w-3.5" />
                    {viewing.category}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Last Updated</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{formatDate(viewing.updated_at)}</p>
                </div>
                {viewing.requires_acknowledgment && viewing.acknowledgment_count !== undefined && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Acknowledgments</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <Users className="h-3.5 w-3.5 text-blue-500" />
                      {viewing.acknowledgment_count} resident{viewing.acknowledgment_count === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Description</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{viewing.description}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={() => setViewing(null)} className="nl-btn-secondary">
                Close
              </button>
              <button
                type="button"
                onClick={() => openEdit(viewing)}
                className="nl-btn-primary inline-flex items-center gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="relative border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/60 px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-600">
                      {editingId ? "Edit Rule" : "New Rule"}
                    </p>
                    <h3 className="text-lg font-bold text-slate-900">
                      {editingId ? "Update Community Rule" : "Add Community Rule"}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Residents will see active rules in the mobile app.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Basic Info</p>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Rule Title *</label>
                  <ClearableInput
                    type="text"
                    className={inputClass(showError("title", liveErrors), "nl-input")}
                    placeholder="e.g. Quiet Hours Policy"
                    value={form.title}
                    onChange={(e) => setF("title", e.target.value)}
                  />
                  {showError("title", liveErrors) ? (
                    <p className="mt-1 text-xs text-red-600">{showError("title", liveErrors)}</p>
                  ) : null}
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
                      if (value !== RULE_OTHER_CATEGORY) {
                        setCustomCategoryInput("");
                        setF("category", value);
                      } else {
                        setF("category", "");
                      }
                    }}
                  />
                  {categorySelect === RULE_OTHER_CATEGORY ? (
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
                    className={inputClass(showError("description", liveErrors), "nl-input min-h-[110px] resize-y")}
                    placeholder="Describe the rule clearly so residents understand what is expected…"
                    value={form.description}
                    onChange={(e) => setF("description", e.target.value)}
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-400">
                    {form.description.length} characters
                  </p>
                  {showError("description", liveErrors) ? (
                    <p className="mt-1 text-xs text-red-600">{showError("description", liveErrors)}</p>
                  ) : null}
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Severity & Visibility</p>
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-slate-700">Severity Level</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["important", "standard", "info"] as const).map((s) => {
                      const meta = SEVERITY_META[s];
                      const Icon = meta.icon;
                      const selected = form.severity === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setF("severity", s)}
                          className={[
                            "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition",
                            selected
                              ? `${meta.badge} ring-2 ring-offset-1 ring-blue-200`
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-sm font-semibold">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200">
                    <ClearableInput
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                      checked={form.requires_acknowledgment}
                      onChange={(e) => setF("requires_acknowledgment", e.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Requires acknowledgment</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Shows as action required on mobile until signed off.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200">
                    <ClearableInput
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                      checked={form.status === "active"}
                      onChange={(e) => setF("status", e.target.checked ? "active" : "inactive")}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Active rule</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Inactive rules are hidden from residents.
                      </span>
                    </span>
                  </label>
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button type="button" onClick={closeForm} disabled={submitting} className="nl-btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !canSubmitForm}
                className="nl-btn-primary disabled:opacity-60"
              >
                {submitting ? "Saving…" : editingId ? "Save Changes" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
