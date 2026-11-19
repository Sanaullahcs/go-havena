"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, UserPlus, Users, X } from "lucide-react";
import { AdminPhoneInput } from "@/components/admin/phone-input";
import { ClearableInput } from "@/components/admin/clearable-field";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import { apiError, apiFieldErrors } from "@/lib/api/client";
import { hasFieldErrors, inputClass, validateEmailField, type FieldErrors } from "@/lib/admin/form-validation-utils";
import {
  STAFF_SKILLS,
  createStaff,
  fetchStaffResidents,
  updateStaff,
  type StaffMember,
  type StaffResidentOption,
} from "@/lib/api/staff";
import { toastError, toastSuccess } from "@/lib/alert";
import { formatPhoneDisplay, getPhoneValidationError, phoneFieldFromE164, type PhoneFieldState } from "@/lib/phone/format";

type Source = "resident" | "new";
type StaffField = "resident" | "name" | "email" | "phone" | "specializations";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`;
  return letters.toUpperCase() || "S";
}

function staffNameError(name: string): string | null {
  const value = name.trim();
  if (!value || value.length < 2 || value.length > 120 || !/\p{L}/u.test(value)) {
    return "Enter the staff member's full name.";
  }
  return null;
}

function validateStaffForm(input: {
  editing: boolean;
  source: Source;
  residentId: string;
  name: string;
  email: string;
  phone: PhoneFieldState;
  specializations: string[];
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.editing && input.source === "resident" && !input.residentId) {
    errors.resident = "Select a resident.";
  }
  if (input.editing || input.source === "new" || input.name.trim()) {
    const nameError = staffNameError(input.name);
    if (nameError) errors.name = nameError;
  }
  if (!input.editing && input.source === "new") {
    const emailError = validateEmailField(input.email);
    if (emailError) errors.email = emailError;
  }
  if (!input.phone.digits.trim()) {
    errors.phone = "Phone number is required.";
  } else if (!input.phone.valid) {
    errors.phone = getPhoneValidationError(input.phone.digits, input.phone.country) ?? "Enter a valid phone number.";
  }
  if (input.specializations.length === 0) {
    errors.specializations = "Choose at least one specialization.";
  }
  return errors;
}

export function StaffFormModal({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(member);
  const [source, setSource] = useState<Source>("resident");
  const [residents, setResidents] = useState<StaffResidentOption[]>([]);
  const [residentQuery, setResidentQuery] = useState("");
  const [residentPage, setResidentPage] = useState(1);
  const [residentLastPage, setResidentLastPage] = useState(1);
  const [residentsLoading, setResidentsLoading] = useState(false);
  const [selectedResident, setSelectedResident] = useState<StaffResidentOption | null>(null);
  const residentRequest = useRef(0);
  const [residentId, setResidentId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneFieldState>(() => phoneFieldFromE164(""));
  const [phoneSeed, setPhoneSeed] = useState("");
  const [phoneResetKey, setPhoneResetKey] = useState(0);
  const [staffType, setStaffType] = useState<"internal" | "external">("external");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<StaffField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const liveErrors = useMemo(
    () => validateStaffForm({ editing, source, residentId, name, email, phone, specializations }),
    [editing, source, residentId, name, email, phone, specializations],
  );
  const canSubmit = !hasFieldErrors(liveErrors);

  const loadResidents = useCallback(async (search: string, page: number, append: boolean) => {
    const token = ++residentRequest.current;
    setResidentsLoading(true);
    try {
      const result = await fetchStaffResidents({ search, page, perPage: 25 });
      if (token !== residentRequest.current) return;
      setResidents((current) => {
        const next = append ? [...current, ...result.data] : result.data;
        const seen = new Set<number>();
        return next.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setResidentPage(result.meta.current_page);
      setResidentLastPage(result.meta.last_page);
    } catch (err) {
      if (token === residentRequest.current) toastError(apiError(err));
    } finally {
      if (token === residentRequest.current) setResidentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSource("resident");
    setResidentId("");
    setSelectedResident(null);
    setResidentQuery("");
    setResidents([]);
    setResidentPage(1);
    setResidentLastPage(1);
    setName(member?.name ?? "");
    setEmail(member?.email ?? "");
    setPhone(phoneFieldFromE164(member?.phone ?? ""));
    setPhoneSeed(member?.phone ?? "");
    setPhoneResetKey((key) => key + 1);
    setStaffType(member?.staff_type ?? "external");
    setSpecializations(member?.specializations ?? []);
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
    setBusy(false);
  }, [open, member]);

  useEffect(() => {
    if (!open || editing || source !== "resident") return;
    const handle = window.setTimeout(() => {
      void loadResidents(residentQuery, 1, false);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, editing, source, residentQuery, loadResidents]);

  if (!open) return null;

  const showError = (field: StaffField) => Boolean((submitAttempted || touched[field]) && errors[field]);
  const loadMoreResidents = () => {
    if (residentsLoading || residentPage >= residentLastPage) return;
    void loadResidents(residentQuery, residentPage + 1, true);
  };
  const touch = (field: StaffField) => setTouched((prev) => ({ ...prev, [field]: true }));
  const clearError = (field: StaffField) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const chooseSource = (next: Source) => {
    setSource(next);
    setResidentId("");
    setSelectedResident(null);
    setResidentQuery("");
    setName("");
    setEmail("");
    setPhone(phoneFieldFromE164(""));
    setPhoneSeed("");
    setPhoneResetKey((key) => key + 1);
    setErrors({});
    setTouched({});
  };

  const chooseResident = (resident: StaffResidentOption) => {
    setResidentId(String(resident.id));
    setSelectedResident(resident);
    clearError("resident");
    setName(resident.name ?? "");
    setEmail(resident.email ?? "");
    setPhone(phoneFieldFromE164(resident.phone ?? ""));
    setPhoneSeed(resident.phone ?? "");
    setPhoneResetKey((key) => key + 1);
  };

  const save = async () => {
    setSubmitAttempted(true);
    const nextErrors = validateStaffForm({ editing, source, residentId, name, email, phone, specializations });
    setErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) return;
    setBusy(true);
    try {
      if (member) {
        await updateStaff(member.id, {
          name: name.trim(),
          phone: phone.e164,
          staff_type: staffType,
          specializations,
        });
        toastSuccess("Staff member updated");
      } else {
        const created = await createStaff({
          name: name.trim(),
          email: email.trim(),
          phone: phone.e164,
          ...(source === "resident" ? { user_id: Number(residentId) } : {}),
          staff_type: staffType,
          specializations,
        });
        if (created.member.delivery_error) toastError(created.message);
        else toastSuccess(created.message || "Staff member added. An invitation email was sent.");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors((prev) => ({
          ...prev,
          ...(fieldErrors.name ? { name: fieldErrors.name } : {}),
          ...(fieldErrors.email ? { email: fieldErrors.email } : {}),
          ...(fieldErrors.phone ? { phone: fieldErrors.phone } : {}),
          ...(fieldErrors.specializations ? { specializations: fieldErrors.specializations } : {}),
          ...(fieldErrors.user_id ? { resident: fieldErrors.user_id } : {}),
        }));
        setTouched((prev) => ({ ...prev, name: true, email: true, phone: true, resident: true, specializations: true }));
      }
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const lockedIdentity = !editing && source === "resident";

  const showContact = editing || source === "new" || Boolean(residentId);
  const pickerClass = "[&_.nl-picker-trigger]:min-h-11 [&_.nl-picker-trigger]:pr-3.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button type="button" className="absolute inset-0 bg-[#0A2A43]/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Close dialog" />
      <div className="relative flex max-h-[min(680px,calc(100dvh-2rem))] w-full max-w-[540px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(10,42,67,0.28)] ring-1 ring-slate-200 animate-modal-in" role="dialog" aria-modal="true" aria-labelledby="staff-form-title">
        <div className="h-1 shrink-0 bg-[#1B4F8A]" />
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1B4F8A] text-white">
            <UserPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 id="staff-form-title" className="text-base font-bold text-[#0A2A43]">{editing ? "Edit staff" : "Add staff"}</h3>
            <p className="mt-0.5 text-[13px] leading-5 text-slate-500">
              {editing ? "Update this staff member for the current community." : "Invite a resident or a new worker. Resident access stays separate."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" data-popover-boundary>
          {!editing ? (
            <div>
              <p className="text-[13px] font-medium text-slate-700">Add staff from</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ["resident", "Existing resident", "Approved member", Users],
                  ["new", "New staff", "External worker", UserPlus],
                ] as const).map(([value, label, hint, Icon]) => {
                  const active = source === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => chooseSource(value)}
                      className={[
                        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                        active
                          ? "border-[#1B4F8A] bg-[#F4F8FD] shadow-[0_0_0_1px_#1B4F8A]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-[#1B4F8A] text-white" : "bg-slate-100 text-slate-500"].join(" ")}>
                        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className={["block truncate text-[13px] font-semibold", active ? "text-[#1B4F8A]" : "text-[#0A2A43]"].join(" ")}>{label}</span>
                        <span className="block truncate text-[11px] text-slate-500">{hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {lockedIdentity ? (
            <Field label="Select resident" required error={showError("resident") ? errors.resident : undefined}>
              <div className={pickerClass}>
                <ResidentSelect
                  residents={residents}
                  query={residentQuery}
                  loading={residentsLoading}
                  hasMore={residentPage < residentLastPage}
                  selected={selectedResident}
                  invalid={Boolean(showError("resident"))}
                  onQuery={setResidentQuery}
                  onLoadMore={loadMoreResidents}
                  onSelect={chooseResident}
                />
              </div>
            </Field>
          ) : null}

          {lockedIdentity && selectedResident ? (
            <div className="flex items-center gap-3 rounded-xl border border-[#D7E4F2] bg-[#F4F8FD] px-3.5 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B4F8A] text-[13px] font-bold text-white">
                {initials(selectedResident.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0A2A43]">{selectedResident.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {selectedResident.email}
                  {selectedResident.unit ? ` · Unit ${selectedResident.unit}` : ""}
                  {selectedResident.phone ? ` · ${formatPhoneDisplay(selectedResident.phone)}` : ""}
                </p>
              </div>
            </div>
          ) : null}

          {!lockedIdentity ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required error={(name.trim() && staffNameError(name)) || (showError("name") ? errors.name : undefined)}>
                <ClearableInput
                  value={name}
                  onChange={(event) => {
                    clearError("name");
                    setName(event.target.value);
                  }}
                  onBlur={() => {
                    touch("name");
                    setErrors((prev) => ({ ...prev, name: staffNameError(name) ?? undefined }));
                  }}
                  placeholder="Staff name"
                  className={inputClass((name.trim() && staffNameError(name)) || (showError("name") ? errors.name : undefined), "nl-input min-h-11 w-full")}
                />
              </Field>
              <Field label="Email" required error={showError("email") ? errors.email : undefined}>
                <ClearableInput
                  type="email"
                  value={email}
                  disabled={editing}
                  onChange={(event) => {
                    clearError("email");
                    setEmail(event.target.value);
                  }}
                  onBlur={() => {
                    if (editing) return;
                    touch("email");
                    setErrors((prev) => ({ ...prev, email: validateEmailField(email) ?? undefined }));
                  }}
                  placeholder="email@example.com"
                  className={inputClass(showError("email") ? errors.email : undefined, "nl-input min-h-11 w-full disabled:bg-slate-50")}
                />
              </Field>
            </div>
          ) : null}

          {showContact ? (
            <Field
              label="Phone number"
              required
              error={
                showError("phone") && errors.phone && errors.phone !== (
                  !phone.digits.trim()
                    ? "Phone number is required."
                    : getPhoneValidationError(phone.digits, phone.country) ?? "Enter a valid phone number."
                )
                  ? errors.phone
                  : undefined
              }
            >
              <AdminPhoneInput
                value={phoneSeed}
                resetKey={phoneResetKey}
                required
                showError={showError("phone")}
                onChange={(state) => {
                  clearError("phone");
                  setPhone(state);
                }}
                onBlur={() => {
                  touch("phone");
                  const next = validateStaffForm({ editing, source, residentId, name, email, phone, specializations });
                  setErrors((prev) => ({ ...prev, phone: next.phone }));
                }}
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Staff type">
              <div className={pickerClass}>
                <ThemedSelect
                  value={staffType}
                  onChange={(value) => setStaffType(value as "internal" | "external")}
                  options={[
                    { value: "internal", label: "Internal" },
                    { value: "external", label: "External" },
                  ]}
                />
              </div>
            </Field>
            <Field label="Specialization" required error={showError("specializations") ? errors.specializations : undefined}>
              <div className={pickerClass}>
                <StaffSkillSelect
                  value={specializations}
                  invalid={Boolean(showError("specializations"))}
                  onChange={(next) => {
                    clearError("specializations");
                    setSpecializations(next);
                  }}
                />
              </div>
            </Field>
          </div>

          {!editing ? (
            <div className="flex gap-2.5 rounded-xl border border-[#D7E4F2] bg-[#F7FBFC] px-3.5 py-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E]" aria-hidden />
              <p className="text-[12px] leading-5 text-slate-600">
                {source === "resident"
                  ? "Their unit and resident access stay in place. They receive a separate staff invitation for this community."
                  : "A new email creates a staff account. An email that already belongs to Havena reuses that account."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-[#F8FAFC] px-5 py-3.5">
          <button type="button" className="nl-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="nl-btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !canSubmit} onClick={() => void save()}>
            {busy ? "Saving…" : editing ? "Save" : "Add staff"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResidentSelect({
  residents,
  query,
  loading,
  hasMore,
  selected,
  invalid,
  onQuery,
  onLoadMore,
  onSelect,
}: {
  residents: StaffResidentOption[];
  query: string;
  loading: boolean;
  hasMore: boolean;
  selected: StaffResidentOption | null;
  invalid?: boolean;
  onQuery: (value: string) => void;
  onLoadMore: () => void;
  onSelect: (resident: StaffResidentOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const onWheel = (event: WheelEvent) => {
      if (list.scrollHeight <= list.clientHeight + 1) return;
      event.preventDefault();
      event.stopPropagation();
      list.scrollTop += event.deltaY;
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 32) onLoadMore();
    };
    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, [open, onLoadMore]);

  useEffect(() => {
    if (!open) return;
    const focus = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.clearTimeout(focus);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((current) => !current)}
        className={["nl-picker-trigger w-full", selected ? "has-value" : "", open ? "nl-picker-trigger-open" : "", invalid ? "border-red-300 ring-1 ring-red-100" : ""].join(" ")}
      >
        <span className={["nl-picker-text", selected ? "" : "is-placeholder"].join(" ")}>
          {selected ? `${selected.name} · ${selected.email}` : "Search name, email, or unit"}
        </span>
        <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={16} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <ClearableInput
                ref={searchRef}
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Search name, email, or unit"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-[13px] text-[#0A2A43] outline-none focus:border-[#1B4F8A]"
              />
            </div>
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label="Approved residents"
            className="nl-dashboard-panel-scroll max-h-60 overflow-y-auto overscroll-contain p-1"
            onScroll={(event) => {
              if (!hasMore || loading) return;
              const el = event.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) onLoadMore();
            }}
          >
            {residents.map((resident) => {
              const active = selected?.id === resident.id;
              const detail = [resident.email, resident.unit ? `Unit ${resident.unit}` : ""].filter(Boolean).join(" · ");
              return (
                <button
                  key={resident.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={resident.already_staff}
                  onClick={() => {
                    if (resident.already_staff) return;
                    onSelect(resident);
                    setOpen(false);
                  }}
                  className={["flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left", resident.already_staff ? "cursor-default text-slate-400" : active ? "bg-[#E8F1FA] text-[#1B4F8A]" : "text-[#0A2A43] hover:bg-slate-50"].join(" ")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{resident.name}</span>
                    {detail ? <span className="mt-0.5 block truncate text-[12px] font-normal text-slate-500">{detail}</span> : null}
                  </span>
                  {resident.already_staff ? <span className="mt-0.5 shrink-0 text-[11px] font-semibold text-slate-400">Already staff</span> : null}
                  {active && !resident.already_staff ? <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
            {loading ? <p className="px-2.5 py-3 text-center text-[12px] text-slate-500">Loading residents…</p> : null}
            {!loading && residents.length === 0 ? <p className="px-2.5 py-3 text-center text-[12px] text-slate-500">No approved residents match.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? <span className="block text-[11px] font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

function StaffSkillSelect({
  value,
  onChange,
  invalid = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { style } = useAnchoredPopover(open, anchorRef, {
    popoverRef: panelRef,
    align: "left",
    gap: 8,
    maxHeight: 280,
    constrainToViewport: true,
    preferBelow: true,
  });
  const selected = STAFF_SKILLS.filter(([key]) => value.includes(key)).map(([, label]) => label);
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return STAFF_SKILLS.filter(([, label]) => !needle || label.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((current) => !current)}
        className={["nl-picker-trigger w-full", selected.length ? "has-value" : "", open ? "nl-picker-trigger-open" : "", invalid ? "border-red-300 ring-1 ring-red-100" : ""].join(" ")}
      >
        <span className={["nl-picker-text", selected.length ? "" : "is-placeholder"].join(" ")}>
          {selected.length ? selected.join(", ") : "Choose specializations"}
        </span>
        <ChevronDown className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`} size={16} strokeWidth={2} aria-hidden />
      </button>
      {open ? createPortal(
        <div ref={panelRef} role="listbox" aria-label="Specialization" style={style} className="nl-themed-popover nl-select-popover overflow-hidden p-0">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <ClearableInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search specializations"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-[13px] text-[#0A2A43] outline-none focus:border-[#14B8A6]"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto p-1.5">
            {options.length === 0 ? <p className="px-2.5 py-3 text-[13px] text-slate-500">No matching specializations.</p> : null}
            {options.map(([key, label]) => {
              const active = value.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onChange(active ? value.filter((item) => item !== key) : [...value, key])}
                  className={["nl-select-option", active ? "nl-select-option-selected" : ""].join(" ")}
                >
                  <span>{label}</span>
                  {active ? <Check size={14} strokeWidth={2.5} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
