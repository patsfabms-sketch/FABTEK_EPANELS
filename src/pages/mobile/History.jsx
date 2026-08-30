import { useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";

const FILTERS = ["This Week", "Last Week", "This Month", "All"];

export default function History() {
  const { myWorkHistory: workHistory } = useApp();
  const [filter, setFilter] = useState("This Week");

  const rows = useMemo(() => {
    if (filter === "This Week") return workHistory.slice(0, 4);
    if (filter === "Last Week") return workHistory.slice(4, 8);
    if (filter === "This Month") return workHistory;
    return workHistory;
  }, [workHistory, filter]);

  const weekTotals = useMemo(() => {
    const scope = workHistory.slice(0, 4);
    const hours = scope.reduce((s, h) => s + h.hours, 0);
    const tasksCompleted = scope.filter((h) => h.taskCompleted).length;
    return {
      hours: Number(hours.toFixed(1)),
      avgPerDay: scope.length ? (hours / scope.length).toFixed(1) : 0,
      tasksCompleted,
    };
  }, [workHistory]);

  return (
    <div className="p-5">
      <h1 className="text-lg font-bold text-ink-900">Work History</h1>
      <p className="text-[11px] text-ink-500 mt-0.5">Review logged sessions and task progress</p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3.5">
          <p className="text-[10px] font-semibold text-ink-500">Weekly hours</p>
          <p className="text-lg font-bold text-ink-900 mt-0.5">{weekTotals.hours}</p>
        </div>
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3.5">
          <p className="text-[10px] font-semibold text-ink-500">Daily average</p>
          <p className="text-lg font-bold text-ink-900 mt-0.5">{weekTotals.avgPerDay} hrs/day</p>
        </div>
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3.5 col-span-2">
          <p className="text-[10px] font-semibold text-ink-500">Tasks completed</p>
          <p className="text-lg font-bold text-ink-900 mt-0.5">{weekTotals.tasksCompleted}</p>
        </div>
      </div>

      <div className="flex gap-1.5 mt-4 mb-1 overflow-x-auto scrollbar-thin">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
              filter === f ? "bg-brand-500 text-white" : "bg-paper-100 text-ink-600"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2.5">
        {rows.length === 0 && (
          <p className="text-xs text-ink-400 text-center py-8">No sessions logged in this range.</p>
        )}
        {rows.map((h) => (
          <div key={h.id} className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900">{h.date}</p>
              <span
                className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                  h.status === "Verified" ? "bg-good-50 text-good-600" : "bg-bad-50 text-bad-600"
                }`}
              >
                {h.status === "Verified" ? "✓ Verified" : "⚑ Flagged"}
              </span>
            </div>
            <p className="text-[11px] text-ink-500 mt-1">
              Panel {h.panel} {h.stage ? `· ${h.stage}` : ""}
            </p>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-600">
              <span>
                <span className="font-semibold text-ink-900">{h.hours}</span> hrs
              </span>
              <span>
                <span className="font-semibold text-ink-900">+{h.percentAdded}%</span> progress
              </span>
              {h.connectionsCredited > 0 && (
                <span>
                  <span className="font-semibold text-ink-900">+{h.connectionsCredited}</span> connections
                </span>
              )}
              <span
                className={`font-semibold ${h.taskCompleted ? "text-good-600" : "text-warn-600"}`}
              >
                {h.taskCompleted ? "Task Completed" : "Partial — left for next tech"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
