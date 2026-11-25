export class ApiError extends Error {
  constructor(message, {
    status,
    code,
    errors,
    statusKind,
    reason,
    rejectedBy,
    feature,
    suspendedAt,
    retryAfterSeconds,
    rateLimit,
    rejectionReason,
    guestInvitation,
    meta,
  } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.statusKind = statusKind;
    this.reason = reason;
    this.rejectedBy = rejectedBy;
    this.feature = feature ?? null;
    this.suspendedAt = suspendedAt ?? null;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
    this.rateLimit = rateLimit ?? null;
    this.rejectionReason = rejectionReason ?? null;
    this.guestInvitation = guestInvitation ?? null;
    this.meta = meta ?? null;
  }
}
