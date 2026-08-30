import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  initialRoleDefaults,
  initialEmployees,
  initialActivityFeed,
  initialWorkHistory,
  initialPanels,
  initialPricePerConnection,
  initialActiveSessions,
  initialAdmins,
  attainment,
  taskProgress,
  generateUsername,
  productionStages,
} from "../data/mockData";

const AppContext = createContext(null);
const STORAGE_KEY = "assemblyos-state-v7";

// The one stage where progress logged translates directly into a connection
// count — see stopSession below.
const CONNECT_STAGE_LABEL = productionStages.find((s) => s.key === "connect")?.label;

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  const persisted = loadPersisted();

  const [roleDefaults, setRoleDefaults] = useState(persisted?.roleDefaults ?? initialRoleDefaults);
  const [employees, setEmployees] = useState(persisted?.employees ?? initialEmployees);
  const [pendingOverrides, setPendingOverrides] = useState({});
  const [activityFeed, setActivityFeed] = useState(persisted?.activityFeed ?? initialActivityFeed);
  const [workHistory, setWorkHistory] = useState(persisted?.workHistory ?? initialWorkHistory);
  const [panels, setPanels] = useState(persisted?.panels ?? initialPanels);
  const [pricePerConnection, setPricePerConnectionState] = useState(
    persisted?.pricePerConnection ?? initialPricePerConnection
  );
  const [activeSessions, setActiveSessions] = useState(persisted?.activeSessions ?? initialActiveSessions);
  const [currentUserId, setCurrentUserId] = useState(persisted?.currentUserId ?? null);
  const [admins, setAdmins] = useState(persisted?.admins ?? initialAdmins);
  const [currentAdminId, setCurrentAdminId] = useState(persisted?.currentAdminId ?? null);
  const [session, setSession] = useState(
    persisted?.session ?? {
      active: false,
      panel: null,
      stage: null,
      targetConnections: null,
      startingProgress: 0,
      startedAt: null,
      notes: "",
    }
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          roleDefaults,
          employees,
          activityFeed,
          workHistory,
          panels,
          pricePerConnection,
          activeSessions,
          currentUserId,
          admins,
          currentAdminId,
          session,
        })
      );
    } catch {
      // storage unavailable (private mode, quota) — app still works, just won't persist
    }
  }, [
    roleDefaults,
    employees,
    activityFeed,
    workHistory,
    panels,
    pricePerConnection,
    activeSessions,
    currentUserId,
    admins,
    currentAdminId,
    session,
  ]);

  // ---- Goal management actions -------------------------------------------------
  function updateRoleDefault(role, field, value) {
    setRoleDefaults((prev) => ({
      ...prev,
      [role]: { ...prev[role], [field]: value },
    }));
  }

  function setPendingOverride(employeeId, value) {
    setPendingOverrides((prev) => ({ ...prev, [employeeId]: value }));
  }

  function applyGoalChanges() {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (!(emp.id in pendingOverrides)) return emp;
        const raw = pendingOverrides[emp.id];
        const parsed = raw === "" || raw === null ? null : Number(raw);
        return { ...emp, override: Number.isFinite(parsed) ? parsed : null };
      })
    );
    setPendingOverrides({});
  }

  function resetOverride(employeeId) {
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, override: null } : e)));
    setPendingOverrides((prev) => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
  }

  const hasPendingChanges = Object.keys(pendingOverrides).length > 0;

  const allUsernames = () =>
    [...employees.map((e) => e.username), ...admins.map((a) => a.username)].filter(Boolean);

  // Creates a new roster entry with an auto-generated username. There's no
  // manager-issued password — the technician sets their own 4-digit PIN the
  // first time they log in on the mobile app (see login/setPin below).
  function addEmployee({ name, role, payRate }) {
    const username = generateUsername(name, allUsernames());
    const newEmployee = {
      id: `e${Date.now()}`,
      name,
      role,
      payRate: Number(payRate) || 0,
      username,
      pin: null,
      override: null,
      currentWeekAvg: 0,
      station: "Unassigned",
      panel: null,
    };
    setEmployees((prev) => [...prev, newEmployee]);
    setActivityFeed((prev) => [
      {
        id: `a${Date.now()}`,
        who: currentAdmin?.name ?? "Manager",
        action: `added ${name} as a new ${role}`,
        ref: `@${username}`,
        time: "just now",
        kind: "scan",
      },
      ...prev,
    ]);
    return { username };
  }

  // Edits an existing roster entry in place — name, role, pay rate, station,
  // whatever the Team Matrix's edit form sends. Username/PIN are untouched
  // (changing those goes through the mobile login flow, not this).
  function updateEmployee(employeeId, fields) {
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, ...fields } : e)));
  }

  // Removes someone from the roster. Their past workHistory/activityFeed
  // entries are left as-is (already rendered with a `?.` fallback to
  // "Unknown Technician" wherever an employee is looked up by id — see
  // Panels.jsx, EmployeeDetail.jsx) rather than being deleted too, so
  // production history doesn't silently disappear. Any live session they're
  // in the middle of is ended, and if they're the one currently signed into
  // the mobile app, that session is cleared as well.
  function deleteEmployee(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    setActiveSessions((prev) => prev.filter((s) => s.employeeId !== employeeId));
    setPendingOverrides((prev) => {
      if (!(employeeId in prev)) return prev;
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
    if (currentUserId === employeeId) setCurrentUserId(null);
    setActivityFeed((prev) => [
      {
        id: `a${Date.now()}`,
        who: currentAdmin?.name ?? "Manager",
        action: `removed ${emp?.name ?? "a team member"} from the roster`,
        ref: emp ? `@${emp.username}` : "",
        time: "just now",
        kind: "scan",
      },
      ...prev,
    ]);
  }

  // Admins have desktop console access but aren't part of the technician
  // roster — no role, pay rate, or attainment tracking. Like technicians,
  // they set their own password the first time they log in (see below).
  function addAdmin({ name }) {
    const username = generateUsername(name, allUsernames());
    const newAdmin = { id: `admin${Date.now()}`, name, username, password: null };
    setAdmins((prev) => [...prev, newAdmin]);
    setActivityFeed((prev) => [
      {
        id: `a${Date.now()}`,
        who: currentAdmin?.name ?? "Manager",
        action: `added ${name} as a new admin`,
        ref: `@${username}`,
        time: "just now",
        kind: "scan",
      },
      ...prev,
    ]);
    return { username };
  }

  // ---- Desktop admin login -------------------------------------------------
  function findAdminByUsername(username) {
    return admins.find((a) => a.username?.toLowerCase() === username.trim().toLowerCase()) ?? null;
  }

  function checkAdminUsername(username) {
    const admin = findAdminByUsername(username);
    if (!admin) return { found: false };
    return { found: true, adminId: admin.id, needsSetup: !admin.password };
  }

  function adminLogin(username, password) {
    const admin = findAdminByUsername(username);
    if (!admin) return { ok: false, error: "Username not found." };
    if (!admin.password) return { ok: false, needsSetup: true, adminId: admin.id };
    if (admin.password !== password) return { ok: false, error: "Incorrect password." };
    setCurrentAdminId(admin.id);
    return { ok: true };
  }

  // Sets an admin's password the first time they log in, then signs them in.
  function setAdminPasswordAndLogin(adminId, password) {
    setAdmins((prev) => prev.map((a) => (a.id === adminId ? { ...a, password } : a)));
    setCurrentAdminId(adminId);
  }

  function adminLogout() {
    setCurrentAdminId(null);
  }

  // ---- Mobile login -------------------------------------------------------
  // Looks up a technician by username. If they've never set a PIN yet,
  // the caller (Login screen) should route them to first-time PIN setup
  // instead of a PIN prompt.
  function findByUsername(username) {
    return employees.find((e) => e.username?.toLowerCase() === username.trim().toLowerCase()) ?? null;
  }

  // Used by the Login screen right after username entry to decide whether to
  // prompt for an existing PIN or route to first-time PIN setup.
  function checkUsername(username) {
    const emp = findByUsername(username);
    if (!emp) return { found: false };
    return { found: true, employeeId: emp.id, needsSetup: !emp.pin };
  }

  function login(username, pin) {
    const emp = findByUsername(username);
    if (!emp) return { ok: false, error: "Username not found." };
    if (!emp.pin) return { ok: false, needsSetup: true, employeeId: emp.id };
    if (emp.pin !== pin) return { ok: false, error: "Incorrect PIN." };
    setCurrentUserId(emp.id);
    return { ok: true };
  }

  // Sets a technician's PIN the first time they log in, then signs them in.
  function setPinAndLogin(employeeId, pin) {
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, pin } : e)));
    setCurrentUserId(employeeId);
  }

  function logout() {
    setCurrentUserId(null);
  }

  // ---- Panel estimates -----------------------------------------------------
  function setPricePerConnection(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) setPricePerConnectionState(num);
  }

  function importEstimates(rows) {
    if (!rows.length) return;
    const today = new Date().toISOString().slice(0, 10);
    setPanels((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      rows.forEach((r) => {
        const existing = byId.get(r.id);
        byId.set(r.id, {
          id: r.id,
          customer: r.customer || existing?.customer || "Unknown Customer",
          order: r.order || existing?.order || "",
          price: r.price,
          jobNumber: r.jobNumber || existing?.jobNumber || "",
          poNumber: r.poNumber || existing?.poNumber || "",
          // Set once, the first time a panel is imported — re-importing the
          // same job (e.g. a revised estimate) doesn't reset it.
          dateAdded: existing?.dateAdded || today,
          pdfDataUrl: r.pdfDataUrl || existing?.pdfDataUrl || null,
          pdfFileName: r.pdfFileName || existing?.pdfFileName || null,
        });
      });
      return Array.from(byId.values());
    });
    setActivityFeed((prev) => [
      {
        id: `a${Date.now()}`,
        who: currentAdmin?.name ?? "Manager",
        action: `imported ${rows.length} panel estimate${rows.length === 1 ? "" : "s"}`,
        ref: "QuickBooks Estimate",
        time: "just now",
        kind: "scan",
      },
      ...prev,
    ]);
  }

  const employeesWithAttainment = useMemo(
    () =>
      employees.map((emp) => ({
        ...emp,
        effectiveOverride: pendingOverrides[emp.id] !== undefined
          ? (pendingOverrides[emp.id] === "" ? null : Number(pendingOverrides[emp.id]))
          : emp.override,
        attainmentPct: attainment(
          {
            ...emp,
            override:
              pendingOverrides[emp.id] !== undefined
                ? (pendingOverrides[emp.id] === "" ? null : Number(pendingOverrides[emp.id]))
                : emp.override,
          },
          roleDefaults
        ),
      })),
    [employees, pendingOverrides, roleDefaults]
  );

  const currentUser = employeesWithAttainment.find((e) => e.id === currentUserId) ?? null;
  const currentAdmin = admins.find((a) => a.id === currentAdminId) ?? null;

  // ---- Mobile work session actions ---------------------------------------------
  // The signed-in technician's real session is mirrored into `activeSessions`
  // so it shows up live on the manager Panels page alongside other
  // technicians' (simulated) concurrent sessions on the same or other panels.
  //
  // Wiring work isn't done in countable discrete units, so instead of tallying
  // a live count during the session, the technician reports how much of the
  // (panel, stage) task their session actually completed (in 10% increments)
  // when they stop. taskProgress() sums those contributions across everyone
  // who has worked the task, so credit for a task finished across multiple
  // people/days splits by what each person actually reported — nobody who
  // only did part of the job gets credit for the whole thing.
  function startSession(panel, stage, targetConnections = null) {
    const startingProgress = taskProgress(workHistory, panel, stage);
    setSession({ active: true, panel, stage, targetConnections, startingProgress, startedAt: Date.now(), notes: "" });
    setActiveSessions((prev) => [
      ...prev.filter((s) => s.employeeId !== currentUserId),
      { id: `live-${currentUserId}`, employeeId: currentUserId, panel, stage, startedAt: Date.now() },
    ]);
    setActivityFeed((prev) => [
      { id: `a${Date.now()}`, who: "You", action: `started ${stage.toLowerCase()} session`, ref: `Panel ${panel}`, time: "just now", kind: "scan" },
      ...prev,
    ]);
  }

  function setSessionNotes(notes) {
    setSession((prev) => ({ ...prev, notes }));
  }

  // percentAdded: how much of the task this session completed, already
  // clamped by the caller to [0, 100 - session.startingProgress]. This is the
  // only way work gets logged — there's no separate manual "log work" entry
  // point, so every workHistory row traces back to an actual scan-in/scan-out
  // session. For the Route/Terminate stage specifically, the percentage
  // reported converts directly into a connection count against the panel's
  // target (e.g. 50% of a 100-connection panel credits 50 connections) — see
  // computeStageStats in mockData.js for how that rolls up into a
  // technician's average connections/hour.
  function stopSession(percentAdded) {
    if (!session.active) return;
    const hours = session.startedAt ? (Date.now() - session.startedAt) / 3600000 : 0;
    const pct = Math.max(0, Math.min(100 - session.startingProgress, percentAdded ?? 0));
    const isComplete = session.startingProgress + pct >= 100;
    const isConnectStage = session.stage === CONNECT_STAGE_LABEL;
    const connectionsCredited =
      isConnectStage && session.targetConnections ? Math.round((pct / 100) * session.targetConnections) : 0;
    setWorkHistory((prev) => [
      {
        id: `h${Date.now()}`,
        employeeId: currentUserId,
        date: new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        panel: session.panel,
        stage: session.stage,
        percentAdded: pct,
        taskCompleted: isComplete,
        connectionsCredited,
        panels: 1,
        hours: Math.max(0.1, Number(hours.toFixed(1))),
        status: "Verified",
      },
      ...prev,
    ]);
    setActivityFeed((prev) => [
      {
        id: `a${Date.now()}`,
        who: "You",
        action:
          (isComplete
            ? `completed ${session.stage.toLowerCase()}`
            : `logged ${pct}% progress on ${session.stage.toLowerCase()} (now ${session.startingProgress + pct}%)`) +
          (connectionsCredited > 0 ? ` · +${connectionsCredited} connections` : ""),
        ref: `Panel ${session.panel}`,
        time: "just now",
        kind: isComplete ? "verify" : "scan",
      },
      ...prev,
    ]);
    setActiveSessions((prev) => prev.filter((s) => s.employeeId !== currentUserId));
    setSession({
      active: false,
      panel: null,
      stage: null,
      targetConnections: null,
      startingProgress: 0,
      startedAt: null,
      notes: "",
    });
  }

  const myWorkHistory = useMemo(
    () => workHistory.filter((h) => h.employeeId === currentUserId),
    [workHistory, currentUserId]
  );

  const value = {
    roleDefaults,
    employees: employeesWithAttainment,
    pendingOverrides,
    hasPendingChanges,
    activityFeed,
    workHistory,
    myWorkHistory,
    panels,
    pricePerConnection,
    activeSessions,
    currentUser,
    admins,
    currentAdmin,
    session,
    updateRoleDefault,
    setPendingOverride,
    applyGoalChanges,
    resetOverride,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    addAdmin,
    setPricePerConnection,
    importEstimates,
    startSession,
    setSessionNotes,
    stopSession,
    checkUsername,
    login,
    setPinAndLogin,
    logout,
    checkAdminUsername,
    adminLogin,
    setAdminPasswordAndLogin,
    adminLogout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
