"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useState } from "react";
import { fetchMembers, type Member } from "@/lib/api/members";
import { apiError } from "@/lib/api/client";
import { UserAvatar } from "@/components/admin/user-avatar";

type Props = {
  audienceType: "all" | "selected";
  selectedIds: number[];
  onAudienceTypeChange: (value: "all" | "selected") => void;
  onSelectedIdsChange: (ids: number[]) => void;
  error?: string;
  showError?: boolean;
};

export function NoticeAudienceField({
  audienceType,
  selectedIds,
  onAudienceTypeChange,
  onSelectedIdsChange,
  error,
  showError = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (audienceType !== "selected") {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    fetchMembers({ status: "approved", role: "member", search, per_page: 50 })
      .then((res) => {
        if (!cancelled) setMembers(res.data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audienceType, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleMember = (memberId: number) => {
    if (selectedSet.has(memberId)) {
      onSelectedIdsChange(selectedIds.filter((id) => id !== memberId));
      return;
    }
    onSelectedIdsChange([...selectedIds, memberId]);
  };

  return (
    <div className="nl-notice-field">
      <p className="nl-notice-option-title">Send to</p>
      <div className="nl-notice-audience-options">
        <label className="nl-notice-audience-option">
          <ClearableInput
            type="radio"
            name="notice-audience"
            checked={audienceType === "all"}
            onChange={() => onAudienceTypeChange("all")}
          />
          <span>All Residents</span>
        </label>
        <label className="nl-notice-audience-option">
          <ClearableInput
            type="radio"
            name="notice-audience"
            checked={audienceType === "selected"}
            onChange={() => onAudienceTypeChange("selected")}
          />
          <span>Selected Residents</span>
        </label>
      </div>

      {audienceType === "selected" ? (
        <div className="nl-notice-audience-picker">
          <ClearableInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search residents by name or unit…"
            className="nl-input w-full"
          />
          {selectedIds.length > 0 ? (
            <p className="nl-notice-schedule-note">{selectedIds.length} resident(s) selected</p>
          ) : null}
          {loadError ? <p className="nl-notice-error">{loadError}</p> : null}
          <div className="nl-notice-audience-list">
            {loading ? (
              <p className="nl-notice-audience-empty">Loading residents…</p>
            ) : members.length === 0 ? (
              <p className="nl-notice-audience-empty">No residents found.</p>
            ) : (
              members.map((member) => {
                const name = member.display_name || member.name || "Resident";
                const checked = selectedSet.has(member.id);

                return (
                  <label key={member.id} className="nl-notice-audience-row">
                    <ClearableInput
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(member.id)}
                    />
                    <UserAvatar name={name} src={member.avatar_url} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
                      {member.unit_number ? (
                        <span className="block truncate text-xs text-slate-500">Unit {member.unit_number}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {showError && error ? <p className="nl-notice-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
