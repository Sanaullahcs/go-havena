"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createPost } from "@/lib/api/feed";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";

const DURATIONS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
];

export function PublishPollModal({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const reset = () => {
    setQuestion("");
    setDescription("");
    setOptions(["", ""]);
    setDuration(3);
    setError("");
  };

  const publish = async () => {
    const labels = options.map((option) => option.trim()).filter(Boolean);
    const unique = new Set(labels.map((label) => label.toLowerCase()));
    if (!question.trim()) {
      setError("Enter a poll question.");
      return;
    }
    if (labels.length < 2 || unique.size !== labels.length) {
      setError("Add at least 2 different options.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createPost({
        category: "poll",
        poll: {
          question: question.trim(),
          description: description.trim(),
          duration_days: duration,
          options: labels,
        },
      });
      toastSuccess("Poll published to your community feed.");
      reset();
      onPublished?.();
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/45" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Publish Poll</h3>
            <p className="mt-1 text-sm text-slate-500">This poll is for community feedback. It does not change rules, notices, or events.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Poll question
            <input
              value={question}
              maxLength={200}
              onChange={(e) => setQuestion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Ask your community a question"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Short description (optional)
            <textarea
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Options</p>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={option}
                  maxLength={80}
                  onChange={(e) => setOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={`Option ${index + 1}`}
                />
                {options.length > 2 ? (
                  <button type="button" className="text-sm text-slate-400" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {options.length < 4 ? (
              <button type="button" className="text-sm font-semibold text-[#1B4F8A]" onClick={() => setOptions((current) => [...current, ""])}>
                Add option
              </button>
            ) : null}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Poll duration</p>
            <div className="mt-2 flex gap-2">
              {DURATIONS.map((item) => (
                <button
                  key={item.days}
                  type="button"
                  onClick={() => setDuration(item.days)}
                  className="rounded-full border px-3 py-1 text-sm"
                  style={{
                    borderColor: duration === item.days ? "#1B4F8A" : "#e2e8f0",
                    background: duration === item.days ? "#E0F2FE" : "#fff",
                    color: "#0A2A43",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={publish}
            className="w-full rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Publishing…" : "Publish Poll"}
          </button>
        </div>
      </div>
    </div>
  );
}
