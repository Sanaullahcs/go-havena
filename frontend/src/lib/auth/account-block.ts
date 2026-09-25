export type AccountBlockDetails = {
  code?: string;
  status?: "suspended" | "rejected" | "pending";
  reason?: string | null;
  rejected_by?: "system_admin" | "community_admin" | null;
};

export function formatRejectedByLabel(rejectedBy?: string | null): string | null {
  if (!rejectedBy) return null;
  if (rejectedBy === "system_admin") return "System administrator";
  if (rejectedBy === "community_admin") return "Community administrator";
  return rejectedBy.replace(/_/g, " ");
}

export function accountBlockTitle(details: AccountBlockDetails): string {
  if (details.status === "pending" || details.code === "COMMUNITY_ADMIN_PENDING") {
    return "Awaiting approval";
  }
  if (details.status === "rejected") return "Account not approved";
  if (details.code === "COMMUNITY_DEACTIVATED") return "Community deactivated";
  return "Account Suspended";
}

function isRejectedAccountBlock(details: AccountBlockDetails): boolean {
  if (details.status === "rejected") return true;
  const code = details.code ?? "";
  return code.includes("REJECTED") || code === "COMMUNITY_ADMIN_REVOKED";
}

export function accountBlockHtml(message: string, details: AccountBlockDetails): string {
  const rows: string[] = [];
  const reason = details.reason?.trim();
  const rejectedBy = isRejectedAccountBlock(details)
    ? formatRejectedByLabel(details.rejected_by)
    : null;

  if (reason) {
    rows.push(
      `<p class="nl-swal-detail"><span class="nl-swal-detail-label">Reason</span><span>${escapeHtml(reason)}</span></p>`,
    );
  }

  if (rejectedBy) {
    rows.push(
      `<p class="nl-swal-detail"><span class="nl-swal-detail-label">Rejected by</span><span>${escapeHtml(rejectedBy)}</span></p>`,
    );
  }

  const intro = escapeHtml(message);
  if (!rows.length) return `<p>${intro}</p>`;

  return `<p>${intro}</p><div class="nl-swal-detail-list">${rows.join("")}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isAccountBlockError(code?: string): boolean {
  return [
    "ACCOUNT_SUSPENDED",
    "COMMUNITY_DEACTIVATED",
    "COMMUNITY_ADMIN_PENDING",
    "COMMUNITY_ADMIN_REJECTED",
    "COMMUNITY_REQUEST_REJECTED",
    "MEMBERSHIP_REJECTED",
  ].includes(code ?? "");
}

export function parseAccountBlockFromResponse(data: Record<string, unknown> | undefined): AccountBlockDetails | null {
  if (!data?.code || !isAccountBlockError(String(data.code))) return null;

  return {
    code: String(data.code),
    status:
      data.status === "rejected"
        ? "rejected"
        : data.status === "pending"
          ? "pending"
          : "suspended",
    reason: typeof data.reason === "string" ? data.reason : null,
    rejected_by:
      data.rejected_by === "system_admin" || data.rejected_by === "community_admin"
        ? data.rejected_by
        : null,
  };
}
