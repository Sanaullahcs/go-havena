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
}: {
  performedBy?: string | null;
  affectedUser?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  changes?: ActivityAuditChange[] | null;
}) {
  const hasChanges = Boolean(changes && changes.length > 0);
  if (!performedBy && !affectedUser && !hasChanges && !entityType) {
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
