import { useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { RoleBadge, Button } from "../../components/ui";

export default function Profile() {
  const { myWorkHistory: workHistory, currentUser, panels, logout } = useApp();

  const assignedPanel = panels.find((p) => `#${p.id}` === currentUser.panel);

  const stats = useMemo(() => {
    const scope = workHistory.slice(0, 7);
    return {
      tasksCompleted: scope.filter((h) => h.taskCompleted).length,
      sessions: scope.length,
      hours: scope.reduce((s, h) => s + h.hours, 0).toFixed(1),
    };
  }, [workHistory]);

  return (
    <div className="p-5">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-brand-500 text-white flex items-center justify-center text-lg font-bold">
          {currentUser.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink-900">{currentUser.name}</h1>
          <RoleBadge role={currentUser.role} />
        </div>
      </div>

      <div className="mt-4 rounded-xl2 bg-white border border-paper-200 shadow-card p-4">
        <p className="text-xs font-semibold text-ink-500 mb-2">Assignment</p>
        <p className="text-sm text-ink-900">{currentUser.station}</p>
        {assignedPanel ? (
          <p className="text-[11px] text-ink-500 mt-0.5">
            {assignedPanel.customer} · {assignedPanel.order}
          </p>
        ) : (
          <p className="text-[11px] text-ink-400 mt-0.5">No panel assigned yet</p>
        )}
      </div>

      <div className="mt-4 rounded-xl2 bg-white border border-paper-200 shadow-card p-4">
        <p className="text-xs font-semibold text-ink-500 mb-2">This week's attainment</p>
        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold text-ink-900">{currentUser.attainmentPct}%</p>
          <p className="text-[11px] text-ink-500">
            {currentUser.currentWeekAvg} hrs avg vs {currentUser.effectiveOverride ?? "team default"} hrs target
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3 text-center">
          <p className="text-base font-bold text-ink-900">{stats.tasksCompleted}</p>
          <p className="text-[10px] text-ink-500 mt-0.5">tasks completed</p>
        </div>
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3 text-center">
          <p className="text-base font-bold text-ink-900">{stats.sessions}</p>
          <p className="text-[10px] text-ink-500 mt-0.5">sessions</p>
        </div>
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3 text-center">
          <p className="text-base font-bold text-ink-900">{stats.hours}</p>
          <p className="text-[10px] text-ink-500 mt-0.5">hours</p>
        </div>
      </div>

      <Button variant="ghost" className="w-full mt-6 py-2.5" onClick={logout}>
        Log Out
      </Button>
    </div>
  );
}
