"use client";

import { Plus, X, type ReactNode } from "lucide-react";

export function cleanTakeaways(items: string[]): string[] {
  return items.map((line) => line.trim()).filter(Boolean);
}

export function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function KeyTakeawaysEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (items: string[]) => void;
}) {
  const updatePoint = (index: number, text: string) => {
    const next = [...value];
    next[index] = text;
    onChange(next);
  };

  const removePoint = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">
          Key takeaway points{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
          onClick={() => onChange([...value, ""])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add point
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-slate-400">
          Add short bullet points shown to residents on the lesson screen.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((point, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">
                {index + 1}
              </span>
              <input
                className="nl-input min-w-0 flex-1"
                placeholder={`Takeaway point ${index + 1}`}
                value={point}
                onChange={(e) => updatePoint(index, e.target.value)}
              />
              <button
                type="button"
                className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => removePoint(index)}
                title="Remove point"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
