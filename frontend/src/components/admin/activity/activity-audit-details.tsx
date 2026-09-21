import { NL } from "@/lib/design-tokens";

export type ActivityAuditChange = {
  field: string;
  previous: string;
  next: string;
};

export function ActivityAuditDetails({
  performedBy,
  affectedUser,
  entityType,
  entityId,
  changes,
  communityName,
  module,
  status,
  requestId,
  ipAddress,
  userAgent,
  error,
  expanded = false,
}: {
  performedBy?: string | null;
  affectedUser?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  changes?: ActivityAuditChange[] | null;
  communityName?: string | null;
  module?: string | null;
  status?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  error?: string | null;
  expanded?: boolean;
}) {
  const hasChanges = Boolean(changes && changes.length > 0);
  if (!performedBy && !affectedUser && !hasChanges && !entityType && !communityName && !module && !status) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: NL.textBody }}>
        {performedBy ? (
          <span>
            <span className="font-semibold" style={{ color: NL.textMuted }}>
              Performed by:{" "}
            </span>
            {performedBy}
          </span>
        ) : null}
        {affectedUser ? (
          <span>
            <span className="font-semibold" style={{ color: NL.textMuted }}>
              Affected User:{" "}
            </span>
            {affectedUser}
          </span>
        ) : null}
        {communityName ? (
          <span>
            <span className="font-semibold" style={{ color: NL.textMuted }}>
              Community:{" "}
            </span>
            {communityName}
          </span>
        ) : null}
        {module ? (
          <span>
            <span className="font-semibold" style={{ color: NL.textMuted }}>
              Module:{" "}
            </span>
            {module}
          </span>
        ) : null}
        {status ? (
          <span>
            <span className="font-semibold" style={{ color: NL.textMuted }}>
              Status:{" "}
            </span>
            {status}
          </span>
        ) : null}
        {entityType ? (
          <span>
            <span className="font-semibold" style={{ color: NL.textMuted }}>
              Record:{" "}
            </span>
            {entityType}
            {entityId ? ` #${entityId}` : ""}
          </span>
        ) : null}
      </div>
      {expanded ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: NL.textSecondary }}>
          {ipAddress ? (
            <span>
              <span className="font-semibold" style={{ color: NL.textMuted }}>
                IP:{" "}
              </span>
              <span className="font-mono">{ipAddress}</span>
            </span>
          ) : null}
          {userAgent ? (
            <span>
              <span className="font-semibold" style={{ color: NL.textMuted }}>
                Device:{" "}
              </span>
              {userAgent}
            </span>
          ) : null}
          {requestId ? (
            <span>
              <span className="font-semibold" style={{ color: NL.textMuted }}>
                Request ID:{" "}
              </span>
              <span className="font-mono">{requestId}</span>
            </span>
          ) : null}
          {error ? (
            <span>
              <span className="font-semibold" style={{ color: NL.textMuted }}>
                Error:{" "}
              </span>
              {error}
            </span>
          ) : null}
        </div>
      ) : null}

      {hasChanges ? (
        <div
          className="rounded-xl border px-3 py-2"
          style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: NL.textMuted }}>
            Changes
          </p>
          <ul className="space-y-1">
            {changes!.map((change, index) => (
              <li key={`${change.field}-${index}`} className="text-[12.5px] leading-relaxed" style={{ color: NL.textBody }}>
                <span className="font-semibold" style={{ color: NL.textPrimary }}>
                  {change.field}:
                </span>{" "}
                <span style={{ color: NL.textSecondary }}>{change.previous || "(empty)"}</span>
                <span style={{ color: NL.textMuted }}> → </span>
                <span className="font-medium" style={{ color: NL.textPrimary }}>
                  {change.next || "(empty)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
