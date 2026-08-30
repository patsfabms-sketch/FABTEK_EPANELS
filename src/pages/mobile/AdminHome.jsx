import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { Button } from "../../components/ui";

// Shown instead of the technician Home/Log Work/History/Profile tabs when an
// admin signs into the mobile app directly (rather than a technician) — see
// mobile/Login.jsx. Admins don't have a role/station/pay rate, so they don't
// fit the technician-shaped screens; this is a lightweight floor-walk view
// instead, with a link back to the full desktop console for anything deeper.
export default function AdminHome() {
  const { currentAdmin, adminLogout, panels, activeSessions, employees } = useApp();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const panelsInProgress = useMemo(
    () => new Set(activeSessions.map((s) => s.panel)).size,
    [activeSessions]
  );

  return (
    <div className="p-5">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-brand-500 text-white flex items-center justify-center text-lg font-bold shrink-0">
          {currentAdmin.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink-900">{currentAdmin.name}</h1>
          <p className="text-xs text-ink-500">Production Manager</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-5">
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3.5 text-center">
          <p className="text-xl font-bold text-ink-900">{panelsInProgress}</p>
          <p className="text-[10px] text-ink-500 mt-0.5">panels in progress</p>
        </div>
        <div className="rounded-xl2 bg-white border border-paper-200 shadow-card p-3.5 text-center">
          <p className="text-xl font-bold text-ink-900">{activeSessions.length}</p>
          <p className="text-[10px] text-ink-500 mt-0.5">technicians active</p>
        </div>
      </div>

      <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mt-6 mb-2">
        Active Right Now
      </p>
      {activeSessions.length === 0 ? (
        <p className="text-xs text-ink-400">No one is currently scanned into a panel.</p>
      ) : (
        <div className="space-y-2">
          {activeSessions.map((s) => {
            const emp = employeeById.get(s.employeeId);
            return (
              <div
                key={s.id}
                className="rounded-xl2 bg-white border border-paper-200 shadow-card px-3.5 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink-900 truncate">
                    {emp?.name ?? "Unknown Technician"}
                  </p>
                  <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse shrink-0" />
                </div>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Panel {s.panel} · {s.stage}
                </p>
                <p className="text-[10px] text-ink-400 mt-0.5">
                  {formatElapsed(s.startedAt, now)} elapsed
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-ink-400 mt-5">
        {panels.length} panel{panels.length === 1 ? "" : "s"} in the registry.
      </p>

      <Button className="w-full mt-6 py-3" onClick={() => navigate("/dashboard")}>
        Open Full Manager Console
      </Button>
      <Button variant="ghost" className="w-full mt-2 py-2.5" onClick={adminLogout}>
        Log Out
      </Button>
    </div>
  );
}

function formatElapsed(startedAt, now) {
  const mins = Math.max(0, Math.round((now - startedAt) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
