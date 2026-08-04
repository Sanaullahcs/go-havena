"use client";

import { useState, useEffect } from "react";
import { fetchWellness, completeLesson, uncompleteLesson, type WellnessCategory, type WellnessItem } from "@/lib/api/wellness";
import { toastSuccess, toastError } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageLoader, EmptyState } from "@/components/shared/page-states";

const CAT_META: Record<string, { label: string; color: string }> = {
  // Current WELLS / course catalog keys
  weight:        { label: "Weight & Diet",   color: "#0A2A43" },
  exercise:      { label: "Exercise",        color: "#0F766E" },
  learning:      { label: "Learning",        color: "#0369A1" },
  stress:        { label: "Lowering Stress", color: "#14B8A6" },
  social:        { label: "Social",          color: "#C2410C" },
  nutrition:     { label: "Nutrition",       color: "#B45309" },
  sleep:         { label: "Sleep",           color: "#14B8A6" },
  mindful:       { label: "Mindfulness",     color: "#0A2A43" },
  // Legacy flat-content keys (kept for older rows)
  fitness:       { label: "Fitness",         color: "#14B8A6" },
  mental_health: { label: "Mental Health",   color: "#7c3aed" },
  mindfulness:   { label: "Mindfulness",     color: "#d97706" },
};

export default function WellnessPage() {
  const [categories, setCategories] = useState<Record<string, WellnessCategory>>({});
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<string | null>(null);

  useEffect(() => {
    fetchWellness()
      .then((data) => {
        setCategories(data);
        const first = Object.keys(data)[0];
        if (first) setActiveTab(first);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalItems     = Object.values(categories).reduce((s, c) => s + c.total, 0);
  const totalCompleted = Object.values(categories).reduce((s, c) => s + c.completed, 0);
  const pct = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

  const handleToggle = async (item: WellnessItem) => {
    // Optimistic update
    setCategories((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = {
          ...updated[key],
          items: updated[key].items.map((i) =>
            i.id === item.id ? { ...i, completed: !item.completed } : i
          ),
          completed: updated[key].items.filter((i) =>
            i.id === item.id ? !item.completed : i.completed
          ).length,
        };
      }
      return updated;
    });

    try {
      if (item.completed) {
        await uncompleteLesson(item.id);
        toastSuccess("Progress reset.");
      } else {
        await completeLesson(item.id);
        toastSuccess("Lesson marked as complete!");
      }
    } catch (err) {
      toastError(apiError(err));
      // Revert on error
      setCategories((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = {
            ...updated[key],
            items: updated[key].items.map((i) =>
              i.id === item.id ? { ...i, completed: item.completed } : i
            ),
            completed: updated[key].items.filter((i) => i.completed).length,
          };
        }
        return updated;
      });
    }
  };

  if (loading) return <PageLoader text="Loading wellness content…" skeleton />;

  const tabs = Object.keys(categories);

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow" style={{ color: "#059669" }}>Health & Wellness</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Wellness Programs</h2>
        <p className="mt-1 text-sm text-slate-500">Track your progress across fitness, nutrition, sleep, and mindfulness.</p>
      </div>

      {/* Overall progress */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold text-white" style={{ background: "#7c3aed" }}>
            {totalCompleted}
          </div>
          <p className="text-[13px] font-medium text-slate-700">Lessons Completed</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold text-white" style={{ background: "#14B8A6" }}>
            {totalItems - totalCompleted}
          </div>
          <p className="text-[13px] font-medium text-slate-700">Lessons Remaining</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold text-white" style={{ background: "#059669" }}>
            {pct}%
          </div>
          <p className="text-[13px] font-medium text-slate-700">Overall Progress</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold text-white" style={{ background: "#d97706" }}>
            {tabs.length}
          </div>
          <p className="text-[13px] font-medium text-slate-700">Categories</p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="nl-panel overflow-hidden">
        <div className="flex gap-1 border-b border-slate-100 bg-slate-50/50 px-4 pt-3 pb-0">
          {tabs.map((key) => {
            const meta = CAT_META[key] ?? { label: key, color: "#64748b" };
            const cat  = categories[key];
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative mb-0 rounded-t-xl px-4 py-2 text-[12.5px] font-semibold transition ${activeTab === key ? "bg-white text-slate-900 shadow-sm border border-slate-100 border-b-white -mb-px" : "text-slate-500 hover:text-slate-700"}`}
              >
                {meta.label}
                {cat.completed > 0 && (
                  <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: meta.color }}>
                    {cat.completed}/{cat.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab && categories[activeTab] ? (
          <div className="divide-y divide-slate-50">
            {/* Category progress bar */}
            <div className="px-5 py-3">
              <div className="flex items-center justify-between text-[12px] text-slate-500 mb-1.5">
                <span>{CAT_META[activeTab]?.label ?? activeTab} Progress</span>
                <span className="font-semibold" style={{ color: CAT_META[activeTab]?.color }}>
                  {categories[activeTab].completed} / {categories[activeTab].total}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round((categories[activeTab].completed / Math.max(1, categories[activeTab].total)) * 100)}%`,
                    background: CAT_META[activeTab]?.color ?? "#14B8A6",
                  }}
                />
              </div>
            </div>

            {categories[activeTab].items.length === 0 ? (
              <EmptyState title="No lessons available" sub="Check back soon for new content." />
            ) : (
              categories[activeTab].items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-5 py-4 transition hover:bg-slate-50/60">
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-[12px] font-bold"
                    style={{ background: item.completed ? "#059669" : (CAT_META[activeTab]?.color ?? "#64748b") }}
                  >
                    {item.duration_min}<span className="text-[9px] ml-0.5">m</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-slate-900">{item.title}</p>
                      {item.completed && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                          Completed
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-[13px] text-slate-500">{item.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle(item)}
                    className={`ml-auto mt-0.5 shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
                      item.completed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    {item.completed ? "Completed" : "Mark Done"}
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <EmptyState title="Select a category" sub="Choose a wellness category above to explore lessons." />
        )}
      </div>
    </div>
  );
}
