import api from "./client";

export const AGREEMENT_CATEGORIES = [
  { value: "lease", label: "Lease & occupancy" },
  { value: "pet", label: "Pet agreement" },
  { value: "parking", label: "Parking" },
  { value: "amenity", label: "Amenity waiver" },
  { value: "maintenance", label: "Maintenance access" },
  { value: "guest", label: "Guest policy" },
  { value: "general", label: "General" },
] as const;

export type AgreementCategory = (typeof AGREEMENT_CATEGORIES)[number]["value"];
export type AgreementStatus = "draft" | "sent" | "closed";
export type RecipientStatus = "pending" | "viewed" | "signed" | "declined";

export type AgreementCounts = {
  total: number;
  pending: number;
  signed: number;
  declined: number;
  viewed: number;
};

export type AgreementRecipient = {
  id: number;
  user_id: number;
  name: string;
  unit: string | null;
  status: RecipientStatus;
  payment_status: string;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  signer_name: string | null;
  certificate_id: string | null;
  signature_url: string | null;
  can_remind?: boolean;
  can_reopen?: boolean;
  can_remove?: boolean;
};

export type Agreement = {
  id: number;
  community_id: number;
  title: string;
  category: AgreementCategory | string;
  body: string;
  cover_message?: string | null;
  status: AgreementStatus;
  audience: "all" | "selected";
  is_required?: boolean;
  signature_fee_cents: number;
  signature_fee_label: string | null;
  requires_payment: boolean;
  due_at: string | null;
  sent_at: string | null;
  closed_at: string | null;
  created_at: string;
  is_overdue?: boolean;
  is_due_soon?: boolean;
  can_edit_content?: boolean;
  can_reopen?: boolean;
  can_withdraw?: boolean;
  can_extend_due?: boolean;
  can_decline?: boolean;
  decline_reason?: string | null;
  counts: AgreementCounts;
  my_status?: RecipientStatus;
  my_payment_status?: string;
  can_sign?: boolean;
  needs_payment?: boolean;
  signer_name?: string | null;
  certificate_id?: string | null;
  content_hash?: string | null;
  signature_url?: string | null;
  signed_at?: string | null;
  recipients?: AgreementRecipient[];
};

export type AgreementForm = {
  title: string;
  category: string;
  body: string;
  cover_message: string;
  audience: "all" | "selected";
  user_ids: number[];
  signature_fee_cents: number;
  due_at: string;
  is_required: boolean;
};

export const AGREEMENT_TEMPLATES: Array<{
  key: string;
  title: string;
  category: AgreementCategory;
  body: string;
}> = [
  {
    key: "living",
    title: "Resident Living Standards Acknowledgment",
    category: "lease",
    body:
      "This agreement confirms that you have received and understood the community living standards, including quiet hours, amenity booking rules, guest registration, and shared-space conduct.\n\nBy applying your paid digital signature you certify that you are the named resident and that this electronic signature is legally binding for community records.",
  },
  {
    key: "pet",
    title: "Pet Registration & Responsibility",
    category: "pet",
    body:
      "I agree to register my pet with the management office, keep animals leashed in common areas, and remain responsible for cleanup and any damage caused by my pet.\n\nA maximum of two pets per unit applies unless management grants written approval.",
  },
  {
    key: "parking",
    title: "Assigned Parking Acknowledgment",
    category: "parking",
    body:
      "I understand that my unit is assigned a designated parking space. Guest parking is limited to marked visitor bays for no more than 24 hours. Vehicles in fire lanes may be towed at the owner’s expense.",
  },
  {
    key: "waiver",
    title: "Amenity Use Waiver",
    category: "amenity",
    body:
      "I acknowledge that use of community amenities is at my own risk. I will follow posted hours, capacity limits, and safety rules, and I will supervise any guests I bring into amenity areas.",
  },
];

export function categoryLabel(value: string) {
  return AGREEMENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export async function fetchAdminAgreements(params?: {
  status?: string;
  category?: string;
  search?: string;
}) {
  const p = new URLSearchParams();
  if (params?.status && params.status !== "all") p.set("status", params.status);
  if (params?.category && params.category !== "all") p.set("category", params.category);
  if (params?.search?.trim()) p.set("search", params.search.trim());
  const res = await api.get(`/v1/admin/agreements?${p.toString()}`);
  const body = res.data ?? {};
  const rows = Array.isArray(body.data) ? body.data : [];
  return {
    data: rows,
    stats: body.stats && typeof body.stats === "object" ? body.stats : {},
    categories: Array.isArray(body.categories) ? body.categories : [],
  };
}

export async function fetchAdminAgreement(id: number) {
  const res = await api.get(`/v1/admin/agreements/${id}`);
  return res.data.data as Agreement;
}

function sanitizeAgreementPayload<T extends Partial<AgreementForm> & {
  send?: boolean;
  status?: AgreementStatus;
  notify_due_change?: boolean;
}>(payload: T) {
  const next = { ...payload };
  if ("due_at" in next) {
    next.due_at = next.due_at?.trim() ? next.due_at : null as never;
  }
  if ("cover_message" in next) {
    next.cover_message = next.cover_message?.trim() ? next.cover_message.trim() : "" as never;
  }
  return next;
}

export async function createAgreement(payload: AgreementForm & { send?: boolean }) {
  const res = await api.post("/v1/admin/agreements", sanitizeAgreementPayload(payload));
  return res.data as { data: Agreement; message: string };
}

export async function updateAgreement(
  id: number,
  payload: Partial<AgreementForm> & { status?: AgreementStatus; notify_due_change?: boolean },
) {
  const res = await api.patch(`/v1/admin/agreements/${id}`, sanitizeAgreementPayload(payload));
  return res.data as { data: Agreement; message: string };
}

export async function sendAgreement(id: number, payload?: { audience?: string; user_ids?: number[] }) {
  const res = await api.post(`/v1/admin/agreements/${id}/send`, payload ?? {});
  return res.data as { data: Agreement; message: string };
}

export async function deleteAgreement(id: number) {
  await api.delete(`/v1/admin/agreements/${id}`);
}

export async function remindAgreement(id: number, userIds?: number[]) {
  const res = await api.post(`/v1/admin/agreements/${id}/remind`, userIds?.length ? { user_ids: userIds } : {});
  return res.data as { data: Agreement; message: string };
}

export async function reopenAgreement(id: number) {
  const res = await api.post(`/v1/admin/agreements/${id}/reopen`);
  return res.data as { data: Agreement; message: string };
}

export async function withdrawAgreement(id: number) {
  const res = await api.post(`/v1/admin/agreements/${id}/withdraw`);
  return res.data as { data: Agreement; message: string };
}

export async function reopenRecipient(id: number, userId: number) {
  const res = await api.post(`/v1/admin/agreements/${id}/recipients/${userId}/reopen`);
  return res.data as { data: Agreement; message: string };
}

export async function removeRecipient(id: number, userId: number) {
  const res = await api.delete(`/v1/admin/agreements/${id}/recipients/${userId}`);
  return res.data as { data: Agreement; message: string };
}

export function exportRecipientsCsv(row: Agreement) {
  const people = row.recipients ?? [];
  const header = [
    "Name",
    "Unit",
    "Status",
    "Viewed at",
    "Signed at",
    "Declined at",
    "Signer name",
    "Certificate ID",
    "Decline reason",
  ];
  const lines = [
    header.join(","),
    ...people.map((person) =>
      [
        person.name,
        person.unit ?? "",
        person.status,
        person.viewed_at ?? "",
        person.signed_at ?? "",
        person.declined_at ?? "",
        person.signer_name ?? "",
        person.certificate_id ?? "",
        person.decline_reason ?? "",
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agreement-${row.id}-recipients.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function duplicateAgreement(id: number) {
  const res = await api.post(`/v1/admin/agreements/${id}/duplicate`);
  return res.data as { data: Agreement; message: string };
}

export async function fetchMyAgreements() {
  const res = await api.get("/v1/agreements");
  const body = res.data ?? {};
  return {
    data: Array.isArray(body.data) ? body.data : [],
    stats: {
      awaiting: Number(body.stats?.awaiting ?? 0),
      signed: Number(body.stats?.signed ?? 0),
    },
  };
}

export async function fetchAgreement(id: number) {
  const res = await api.get(`/v1/agreements/${id}`);
  return res.data.data as Agreement;
}

export async function authorizeAgreementFee(id: number) {
  const res = await api.post(`/v1/agreements/${id}/authorize-fee`);
  return res.data as { data: Agreement; message: string };
}

export async function signAgreement(id: number, payload: {
  signer_name: string;
  signature: string;
  accepted_terms: boolean;
}) {
  const res = await api.post(`/v1/agreements/${id}/sign`, payload);
  return res.data as { data: Agreement; message: string };
}

export async function declineAgreement(id: number, reason?: string) {
  const res = await api.post(`/v1/agreements/${id}/decline`, { reason });
  return res.data as { data: Agreement; message: string };
}
