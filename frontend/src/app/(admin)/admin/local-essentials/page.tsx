"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CheckCircle2, Clock3, Filter, Layers, MapPin, Phone, Plus, X } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { CommunityAddressPicker, type CommunityAddressValue } from "@/components/admin/community-address-picker";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtPagination,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { apiError } from "@/lib/api/client";
import { getPhoneValidationError, type PhoneFieldState } from "@/lib/phone/format";
import {
  createLocalEssential,
  deleteLocalEssential,
  ESSENTIAL_SECTIONS,
  fetchAdminLocalEssentials,
  NEARBY_CATEGORIES,
  reviewLocalEssentialSuggestion,
  type EssentialEntry,
  type EssentialSuggestion,
  type ListingCategory,
} from "@/lib/api/local-essentials";

const DESCRIPTION_MAX = 2000;
const emptyAddress: CommunityAddressValue = { address: "", latitude: null, longitude: null };
const NEW_CATEGORY = "__new__";
const CATEGORY_GROUPS = ["Local essentials", "Nearby places", "Community"] as const;

function categoryGroup(value: string): (typeof CATEGORY_GROUPS)[number] {
  if (ESSENTIAL_SECTIONS.some((item) => item.value === value)) return "Local essentials";
  if (NEARBY_CATEGORIES.some((item) => item.value === value)) return "Nearby places";
  return "Community";
}

type ListFilter = "all" | "published" | "pending";

type ListingRow =
  | { key: string; kind: "entry"; entry: EssentialEntry }
  | { key: string; kind: "suggestion"; suggestion: EssentialSuggestion };

function sectionLabel(section: string, categories: ListingCategory[]): string {
  const known = [...ESSENTIAL_SECTIONS, ...NEARBY_CATEGORIES].find((item) => item.value === section)?.label;
  return known
    ?? categories.find((item) => item.value === section)?.label
    ?? section.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function suggestionSection(item: EssentialSuggestion): string {
  return item.essential_section || item.category || "";
}

export default function LocalEssentialsPage() {
  const [entries, setEntries] = useState<EssentialEntry[]>([]);
  const [suggestions, setSuggestions] = useState<EssentialSuggestion[]>([]);
  const [categories, setCategories] = useState<ListingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<ListingRow | null>(null);
  const [section, setSection] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("US");
  const [address, setAddress] = useState<CommunityAddressValue>(emptyAddress);
  const [touched, setTouched] = useState({ category: false, title: false, phone: false, address: false });
  const [attempted, setAttempted] = useState(false);
  const [description, setDescription] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();

  async function load() {
    setError("");
    try {
      const data = await fetchAdminLocalEssentials();
      setEntries(data.entries);
      setSuggestions(data.suggestions);
      setCategories(data.categories);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const categoryOptions = useMemo(() => {
    const rows = categories.map((item) => ({
      value: item.value,
      label: sectionLabel(item.value, categories),
      group: categoryGroup(item.value),
    }));
    rows.sort((a, b) => CATEGORY_GROUPS.indexOf(a.group) - CATEGORY_GROUPS.indexOf(b.group));
    return [
      {
        value: NEW_CATEGORY,
        label: "Add category",
        description: "Create a custom category",
        pinned: true,
      },
      ...rows,
    ];
  }, [categories]);

  const rows = useMemo<ListingRow[]>(() => [
    ...suggestions.map((suggestion) => ({ key: `suggestion-${suggestion.id}`, kind: "suggestion" as const, suggestion })),
    ...entries.map((entry) => ({ key: `entry-${entry.id}`, kind: "entry" as const, entry })),
  ], [entries, suggestions]);

  const categoryCount = useMemo(() => {
    const keys = new Set<string>();
    entries.forEach((entry) => keys.add(entry.section));
    suggestions.forEach((item) => {
      const sectionKey = suggestionSection(item);
      if (sectionKey) keys.add(sectionKey);
    });
    return keys.size;
  }, [entries, suggestions]);

  const categoryRowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const sectionKey = row.kind === "entry" ? row.entry.section : suggestionSection(row.suggestion);
      if (!sectionKey) return;
      counts.set(sectionKey, (counts.get(sectionKey) ?? 0) + 1);
    });
    return counts;
  }, [rows]);

  const categoryFilterOptions = useMemo(() => {
    const keys = [...categoryRowCounts.keys()].sort((a, b) =>
      sectionLabel(a, categories).localeCompare(sectionLabel(b, categories)),
    );
    return [
      {
        value: "all",
        label: "All categories",
        description: `${rows.length} listing${rows.length === 1 ? "" : "s"}`,
      },
      ...keys.map((value) => ({
        value,
        label: sectionLabel(value, categories),
        description: `${categoryRowCounts.get(value) ?? 0} listing${categoryRowCounts.get(value) === 1 ? "" : "s"}`,
      })),
    ];
  }, [categoryRowCounts, categories, rows.length]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "published" && row.kind !== "entry") return false;
      if (filter === "pending" && row.kind !== "suggestion") return false;
      if (categoryFilter !== "all") {
        const sectionKey = row.kind === "entry" ? row.entry.section : suggestionSection(row.suggestion);
        if (sectionKey !== categoryFilter) return false;
      }
      if (!query) return true;
      const titleText = row.kind === "entry" ? row.entry.title : (row.suggestion.name || "");
      const sectionKey = row.kind === "entry" ? row.entry.section : suggestionSection(row.suggestion);
      const phoneText = row.kind === "entry" ? row.entry.phone : row.suggestion.phone;
      const addressText = row.kind === "entry" ? row.entry.address : row.suggestion.address;
      const detail = row.kind === "entry"
        ? (row.entry.description || row.entry.body || "")
        : (row.suggestion.description || row.suggestion.note || "");
      return [titleText, sectionLabel(sectionKey, categories), phoneText, addressText, detail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [rows, filter, categoryFilter, search, categories]);

  const emptyMessage = useMemo(() => {
    if (categoryFilter !== "all") {
      const label = sectionLabel(categoryFilter, categories);
      return `No listings in ${label}. Try another category or clear the filter.`;
    }
    if (filter === "pending") return "No submissions waiting for review.";
    if (filter === "published") return "No published local essentials yet.";
    return "No local essentials yet. Add one for residents.";
  }, [categoryFilter, categories, filter]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / ADMIN_TABLE_PAGE_SIZE));
  const safePage = Math.min(page, lastPage);
  const paged = filtered.slice((safePage - 1) * ADMIN_TABLE_PAGE_SIZE, safePage * ADMIN_TABLE_PAGE_SIZE);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  function resetForm() {
    setSection("");
    setCustomCategory("");
    setTitle("");
    setPhone("");
    setPhoneDigits("");
    setPhoneCountry("US");
    setAddress(emptyAddress);
    setDescription("");
    setTouched({ category: false, title: false, phone: false, address: false });
    setAttempted(false);
    setFormKey((value) => value + 1);
  }

  function markTouched(field: keyof typeof touched) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  const categoryError = !section
    ? "Category is required."
    : section === NEW_CATEGORY && !customCategory.trim()
      ? "Enter a category name."
      : "";
  const titleError = !title.trim()
    ? "Place name is required."
    : title.trim().length < 2
      ? "Enter at least 2 characters."
      : "";
  const phoneError = !phoneDigits.trim()
    ? "Phone number is required."
    : (getPhoneValidationError(phoneDigits, phoneCountry) ?? "");
  const addressError = !address.address.trim()
    ? "Address is required."
    : address.latitude == null || address.longitude == null
      ? "Choose an address from the suggestions."
      : "";
  const showCategoryError = (touched.category || attempted) && categoryError;
  const showTitleError = (touched.title || attempted) && titleError;
  const showPhoneError = (touched.phone || attempted) && phoneError;
  const showAddressError = (touched.address || attempted) && addressError;

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function onPhoneChange(field: PhoneFieldState) {
    setPhone(field.e164 || "");
    setPhoneDigits(field.digits);
    setPhoneCountry(field.country);
    if (field.digits) markTouched("phone");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const chosen = section === NEW_CATEGORY ? customCategory.trim() : section;
    if (categoryError || titleError || phoneError || addressError || !chosen) return;
    setBusy(true);
    try {
      await createLocalEssential({
        section: chosen,
        title: title.trim(),
        phone: phone.trim() || null,
        address: address.address.trim() || null,
        latitude: address.latitude,
        longitude: address.longitude,
        description: description.trim() || null,
        body: description.trim() || null,
        verified: true,
      });
      resetForm();
      setOpen(false);
      toastSuccess("Local essential added.");
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReview(item: EssentialSuggestion, decision: "approve" | "reject") {
    setBusy(true);
    try {
      await reviewLocalEssentialSuggestion(item.id, decision);
      setViewing((current) => (current?.kind === "suggestion" && current.suggestion.id === item.id ? null : current));
      toastSuccess(decision === "approve" ? "Submission approved." : "Submission rejected.");
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(entry: EssentialEntry) {
    const confirmed = await confirmDelete({ text: `Delete ${entry.title}?` });
    if (!confirmed.isConfirmed) return;
    setBusy(true);
    try {
      await deleteLocalEssential(entry.id);
      setViewing((current) => (current?.kind === "entry" && current.entry.id === entry.id ? null : current));
      toastSuccess("Local essential deleted.");
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader text="Loading local essentials" />;
  if (error && entries.length === 0 && suggestions.length === 0) {
    return <PageError message={error} onRetry={() => { setLoading(true); void load(); }} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Community directory</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Local Essentials</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Publish community listings and review places residents submit.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="nl-btn-primary inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add local essential
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Published" value={String(entries.length)} hint="Visible to residents" icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
        <StatTile label="Pending review" value={String(suggestions.length)} hint="Resident submissions" icon={<Clock3 className="h-4 w-4" />} tone="amber" />
        <StatTile label="Categories" value={String(categoryCount)} hint="Groups with listings" icon={<Layers className="h-4 w-4" />} tone="blue" />
        <StatTile label="Verified" value={String(entries.filter((entry) => entry.verified).length)} hint="Marked verified by admin" icon={<MapPin className="h-4 w-4" />} tone="violet" />
      </div>

      <DataTable
        title="Local essentials"
        totalCount={rows.length}
        visibleCount={filtered.length}
        search={search}
        onSearch={(value) => startTransition(() => { setSearch(value); setPage(1); })}
        searchPlaceholder="Search by title, category, phone, or address"
        searchClassName="min-w-[14rem] w-full max-w-[24rem] sm:w-[24rem] sm:max-w-[24rem]"
        filters={[
          { key: "all", label: "All", count: rows.length },
          { key: "published", label: "Published", count: entries.length },
          { key: "pending", label: "Pending", count: suggestions.length },
        ]}
        activeFilter={filter}
        onFilter={(key) => startTransition(() => { setFilter(key); setPage(1); })}
        toolbar={(
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <span
              className="hidden h-8 w-px shrink-0 bg-slate-200 sm:block"
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                <Filter className="h-4 w-4" aria-hidden />
              </span>
              <SearchableSelect
                combobox
                className="nl-picker-compact min-w-0 flex-1 sm:w-[11.5rem] sm:flex-none"
                value={categoryFilter}
                onChange={(value) => startTransition(() => {
                  setCategoryFilter(value || "all");
                  setPage(1);
                })}
                options={categoryFilterOptions}
                placeholder="All categories"
                searchPlaceholder="Search categories…"
                emptyMessage="No categories match."
              />
            </div>
            {categoryFilter !== "all" ? (
              <button
                type="button"
                className="h-8 shrink-0 rounded-lg px-2.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => startTransition(() => {
                  setCategoryFilter("all");
                  setPage(1);
                })}
              >
                Clear
              </button>
            ) : null}
          </div>
        )}
        empty={emptyMessage}
        isEmpty={filtered.length === 0}
      >
        <DtTable>
          <DtHead
            cols={[
              { label: "Listing" },
              { label: "Category" },
              { label: "Phone" },
              { label: "Address" },
              { label: "Status" },
              { label: "Actions", right: true },
            ]}
          />
          <tbody>
            {paged.map((row) => {
              const isEntry = row.kind === "entry";
              const name = isEntry ? row.entry.title : (row.suggestion.name || "Place update");
              const sectionKey = isEntry ? row.entry.section : suggestionSection(row.suggestion);
              const phoneText = isEntry ? row.entry.phone : row.suggestion.phone;
              const addressText = isEntry ? row.entry.address : row.suggestion.address;
              return (
                <DtRow key={row.key}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{name}</p>
                  </DtCell>
                  <DtCell muted>{sectionKey ? sectionLabel(sectionKey, categories) : "—"}</DtCell>
                  <DtCell nowrap>{phoneText || "—"}</DtCell>
                  <DtCell>{addressText || "—"}</DtCell>
                  <DtCell>
                    <AdminBadge tone={isEntry ? "emerald" : "amber"}>
                      {isEntry ? "Published" : "Pending"}
                    </AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      disabled={busy}
                      actions={[
                        { label: "View", icon: "view", onClick: () => setViewing(row) },
                        isEntry
                          ? { label: "Delete", icon: "delete", tone: "danger", onClick: () => void onDelete(row.entry) }
                          : { label: "Approve", icon: "check", tone: "success", onClick: () => void onReview(row.suggestion, "approve") },
                        ...(isEntry
                          ? []
                          : [{ label: "Reject", icon: "ban" as const, tone: "danger" as const, onClick: () => void onReview(row.suggestion, "reject") }]),
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination
          showing={paged.length}
          total={filtered.length}
          page={safePage}
          lastPage={lastPage}
          onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
        />
      </DataTable>

      {viewing ? (
        <ListingViewDialog
          row={viewing}
          categories={categories}
          busy={busy}
          onClose={() => setViewing(null)}
          onDelete={(entry) => void onDelete(entry)}
          onReview={(item, decision) => void onReview(item, decision)}
        />
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form noValidate onSubmit={onCreate} className="flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">Add local essential</h2>
                <p className="mt-0.5 text-sm text-slate-500">Residents see this listing under Local Essentials.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="block text-sm text-slate-600">
                Category <span className="text-red-600">*</span>
                <div className="mt-1">
                  <SearchableSelect
                    combobox
                    value={section}
                    onChange={setSection}
                    onBlur={() => markTouched("category")}
                    options={categoryOptions}
                    placeholder="Type to search a category"
                    error={showCategoryError && section !== NEW_CATEGORY ? categoryError : null}
                  />
                </div>
                {showCategoryError && section !== NEW_CATEGORY ? <p className="mt-1 text-xs font-medium text-red-600">{categoryError}</p> : null}
              </div>
              {section === NEW_CATEGORY ? (
                <label className="block text-sm text-slate-600">
                  Category name <span className="text-red-600">*</span>
                  <input
                    value={customCategory}
                    onChange={(event) => setCustomCategory(event.target.value)}
                    onBlur={() => markTouched("category")}
                    className={["nl-input box-border mt-1 h-11 w-full !py-0", showCategoryError ? "border-red-300" : ""].join(" ")}
                    placeholder="Shopping Point"
                  />
                  {showCategoryError ? <p className="mt-1 text-xs font-medium text-red-600">{categoryError}</p> : null}
                </label>
              ) : null}
              <label className="block text-sm text-slate-600">
                Place name <span className="text-red-600">*</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => markTouched("title")}
                  className={["nl-input box-border mt-1 h-11 w-full !py-0", showTitleError ? "border-red-300" : ""].join(" ")}
                  placeholder="Place name"
                />
                {showTitleError ? <p className="mt-1 text-xs font-medium text-red-600">{titleError}</p> : null}
              </label>
              <div className="text-sm text-slate-600">
                Phone <span className="text-red-600">*</span>
                <div className="mt-1">
                  <AdminPhoneInput
                    required
                    value={phone}
                    onChange={onPhoneChange}
                    onBlur={() => markTouched("phone")}
                    showError={showPhoneError}
                    resetKey={formKey}
                  />
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Address <span className="text-red-600">*</span>
                <div className="mt-1">
                  <CommunityAddressPicker
                    compact
                    required
                    preserveUserAddress
                    value={address}
                    error={showAddressError ? addressError : ""}
                    onChange={(next) => {
                      setAddress(next);
                      if (next.address.trim()) markTouched("address");
                    }}
                    onBlur={() => markTouched("address")}
                  />
                </div>
              </div>
              <div className="block text-sm text-slate-600">
                Description
                <textarea
                  value={description}
                  maxLength={DESCRIPTION_MAX}
                  onChange={(event) => setDescription(event.target.value.slice(0, DESCRIPTION_MAX))}
                  rows={3}
                  className="nl-input mt-1 w-full"
                />
                <p className={["mt-1 text-right text-xs tabular-nums", description.length >= DESCRIPTION_MAX ? "font-medium text-red-600" : "text-slate-400"].join(" ")}>
                  {description.length}/{DESCRIPTION_MAX}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" disabled={busy} className="nl-btn-primary disabled:opacity-60">
                {busy ? "Saving…" : "Add local essential"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ListingViewDialog({
  row,
  categories,
  busy,
  onClose,
  onDelete,
  onReview,
}: {
  row: ListingRow;
  categories: ListingCategory[];
  busy: boolean;
  onClose: () => void;
  onDelete: (entry: EssentialEntry) => void;
  onReview: (item: EssentialSuggestion, decision: "approve" | "reject") => void;
}) {
  const isEntry = row.kind === "entry";
  const title = isEntry ? row.entry.title : (row.suggestion.name || "Place update");
  const sectionKey = isEntry ? row.entry.section : suggestionSection(row.suggestion);
  const category = sectionKey ? sectionLabel(sectionKey, categories) : "—";
  const phone = (isEntry ? row.entry.phone : row.suggestion.phone) || "";
  const address = (isEntry ? row.entry.address : row.suggestion.address) || "";
  const description = (isEntry
    ? (row.entry.description || row.entry.body)
    : (row.suggestion.description || row.suggestion.note)) || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <AdminBadge tone={isEntry ? "emerald" : "amber"}>{isEntry ? "Published" : "Pending"}</AdminBadge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{category}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                Phone
              </p>
              {phone ? (
                <a href={`tel:${phone}`} className="mt-1 block text-sm font-medium text-[#1B4F8A] hover:underline">{phone}</a>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No phone number</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Address
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">{address || "No address"}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {description || "No description added."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" className="nl-btn-secondary" onClick={onClose}>Close</button>
          {isEntry ? (
            <button type="button" className="nl-btn-danger" disabled={busy} onClick={() => onDelete(row.entry)}>Delete</button>
          ) : (
            <>
              <button type="button" className="nl-btn-danger" disabled={busy} onClick={() => onReview(row.suggestion, "reject")}>Reject</button>
              <button type="button" className="nl-btn-primary" disabled={busy} onClick={() => onReview(row.suggestion, "approve")}>Approve</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
