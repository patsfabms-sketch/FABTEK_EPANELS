import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  initialRoleDefaults,
  attainment,
  taskProgress,
  generateUsername,
  CONNECT_STAGE_LABEL,
  REWORK_STAGE_LABEL,
  effectiveElapsedMs,
  parseClockQrValue,
  isValidClockWeek,
  connectionsPerHour,
  CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD,
} from "../data/mockData";

const AppContext = createContext(null);

// Only what's specific to THIS device — who's signed in here, and any work
// session currently in progress on it — lives in localStorage. Everything
// else (roster, panels, work history, live sessions across the whole shop,
// activity feed) lives in Supabase and is shared by every device; see the
// fetch + realtime-subscription effects below.
const DEVICE_STORAGE_KEY = "assemblyos-device-v1";

function loadDeviceState() {
  try {
    const raw = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function genId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// DB <-> app-state mappers. The app's field names (camelCase, a few renamed
// for history — e.g. `order`, `pdfId`) are kept exactly as they were before
// the backend existed, so every page component below AppContext needed zero
// changes; only this file knows about the assemblyos_* column names.
// ---------------------------------------------------------------------------
function fromDbEmployee(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    payRate: Number(row.pay_rate) || 0,
    username: row.username,
    override: row.override === null || row.override === undefined ? null : Number(row.override),
    currentWeekAvg: Number(row.current_week_avg) || 0,
    station: row.station ?? "Unassigned",
    panel: row.panel ?? null,
    hasPin: !!row.has_pin,
  };
}
const EMPLOYEE_FIELD_MAP = { payRate: "pay_rate", currentWeekAvg: "current_week_avg" };
function toDbEmployeeInsert(emp) {
  return {
    id: emp.id,
    name: emp.name,
    role: emp.role,
    pay_rate: emp.payRate,
    username: emp.username,
    override: emp.override,
    current_week_avg: emp.currentWeekAvg,
    station: emp.station,
    panel: emp.panel,
  };
}
function toDbEmployeeFields(fields) {
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    out[EMPLOYEE_FIELD_MAP[k] ?? k] = v;
  });
  return out;
}

function fromDbAdmin(row) {
  return { id: row.id, name: row.name, username: row.username, password: !!row.has_password };
}

const PANEL_FIELD_MAP = {
  id: "panel_id",
  buildId: "build_id",
  customer: "customer",
  order: "order_number",
  price: "price",
  pricePerConnection: "price_per_connection",
  jobNumber: "job_number",
  poNumber: "po_number",
  serialNumber: "serial_number",
  dateAdded: "date_added",
  pdfId: "pdf_path",
  pdfFileName: "pdf_file_name",
  // Set only for a panel split off a Qty > 1 estimate line item — see
  // estimateImport.js's pushUnitRows and mockData.js's unitLabel(). Both
  // null for an ordinary single-unit panel.
  unitIndex: "unit_index",
  unitCount: "unit_count",
};
function toDbPanel(p) {
  const out = {};
  Object.entries(PANEL_FIELD_MAP).forEach(([k, col]) => {
    if (p[k] !== undefined) out[col] = p[k];
  });
  return out;
}
function toDbPanelFields(fields) {
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    out[PANEL_FIELD_MAP[k] ?? k] = v;
  });
  return out;
}
function fromDbPanel(row) {
  return {
    id: row.panel_id,
    buildId: row.build_id,
    customer: row.customer ?? "",
    order: row.order_number ?? "",
    price: row.price === null ? null : Number(row.price),
    pricePerConnection:
      row.price_per_connection === null || row.price_per_connection === undefined
        ? undefined
        : Number(row.price_per_connection),
    jobNumber: row.job_number ?? "",
    poNumber: row.po_number ?? "",
    serialNumber: row.serial_number ?? "",
    dateAdded: row.date_added,
    pdfId: row.pdf_path,
    pdfFileName: row.pdf_file_name,
    unitIndex: row.unit_index ?? null,
    unitCount: row.unit_count ?? null,
  };
}

function toDbWorkHistory(h) {
  return {
    id: h.id,
    employee_id: h.employeeId,
    date: h.date,
    panel: h.panel,
    stage: h.stage,
    build_id: h.buildId,
    percent_added: h.percentAdded,
    task_completed: h.taskCompleted,
    connections_credited: h.connectionsCredited,
    panels: h.panels,
    hours: h.hours,
    status: h.status,
    started_at: h.startedAt ?? null,
    ended_at: h.endedAt ?? null,
    rework_reason: h.reworkReason ?? null,
    rework_root_cause: h.reworkRootCause ?? null,
    rework_attributed_to_id: h.reworkAttributedToId ?? null,
  };
}
// Partial-update mapper for correcting an existing row — see
// updateWorkHistoryEntry below (EmployeeDetail.jsx's Recent Activity table).
// toDbWorkHistory above stays as the full-row insert mapper used by
// stopSession; this only needs to cover fields an admin correction can touch.
const WORKHISTORY_FIELD_MAP = {
  employeeId: "employee_id",
  date: "date",
  panel: "panel",
  stage: "stage",
  buildId: "build_id",
  percentAdded: "percent_added",
  taskCompleted: "task_completed",
  connectionsCredited: "connections_credited",
  panels: "panels",
  hours: "hours",
  status: "status",
  startedAt: "started_at",
  endedAt: "ended_at",
  reworkReason: "rework_reason",
  reworkRootCause: "rework_root_cause",
  reworkAttributedToId: "rework_attributed_to_id",
};
function toDbWorkHistoryFields(fields) {
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    out[WORKHISTORY_FIELD_MAP[k] ?? k] = v;
  });
  return out;
}
function fromDbWorkHistory(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    panel: row.panel,
    stage: row.stage,
    buildId: row.build_id,
    percentAdded: row.percent_added === null ? 0 : Number(row.percent_added),
    taskCompleted: !!row.task_completed,
    connectionsCredited: row.connections_credited ?? 0,
    panels: row.panels ?? 1,
    hours: row.hours === null ? 0 : Number(row.hours),
    status: row.status ?? "Verified",
    // Real timestamp (DB-assigned, `created_at default now()`) — used for
    // bucketing analytics trend charts by actual calendar day, since `date`
    // above is a display-only formatted string with no year in it. Not
    // present until the row round-trips through the DB; see stopSession,
    // which stamps a local approximation immediately so a just-logged
    // session shows up in trend charts without waiting on that round trip.
    createdAt: row.created_at ?? null,
    // The actual clock-in/clock-out timestamps for this specific session —
    // "what time to what time," shown wherever a logged session is listed
    // (formatTimeRange in ui.jsx). Distinct from createdAt/date above:
    // those say when the row was written, these say when the work itself
    // happened. Null on any entry logged before this field existed.
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    // Populated only for Rework-stage entries (see ActiveSession.jsx's Stop
    // Session flow, which requires all three before a Rework session can be
    // stopped) — null on every other stage, and on any Rework entry logged
    // before this requirement existed.
    reworkReason: row.rework_reason ?? null,
    reworkRootCause: row.rework_root_cause ?? null,
    reworkAttributedToId: row.rework_attributed_to_id ?? null,
  };
}

// Time clock — see clockQrValue/parseClockQrValue in mockData.js and
// AppContext.clockScan below. `hours` here is the RAW gross duration
// between clock-in and clock-out (no break subtraction) — it's a presence
// record ("how long were they at work"), not a "hours worked" figure; that
// distinction already lives on workHistory.hours, which does exclude paid
// breaks (see effectiveElapsedMs). Kept separate on purpose so this table
// stays a simple, honest attendance log.
function toDbClockLog(c) {
  return {
    id: c.id,
    employee_id: c.employeeId,
    clocked_in_at: new Date(c.clockedInAt).toISOString(),
    clocked_out_at: c.clockedOutAt ? new Date(c.clockedOutAt).toISOString() : null,
    hours: c.hours,
  };
}
function fromDbClockLog(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    clockedInAt: row.clocked_in_at ? new Date(row.clocked_in_at).getTime() : null,
    clockedOutAt: row.clocked_out_at ? new Date(row.clocked_out_at).getTime() : null,
    hours: row.hours === null || row.hours === undefined ? null : Number(row.hours),
  };
}

function fromDbActiveSession(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    panel: row.panel,
    stage: row.stage,
    buildId: row.build_id,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : Date.now(),
  };
}

function toDbActivity(a) {
  return { id: a.id, who: a.who, action: a.action, ref: a.ref, kind: a.kind };
}
function fromDbActivity(row) {
  return { id: row.id, who: row.who, action: row.action, ref: row.ref, time: "just now", kind: row.kind };
}

function mergeUpsert(list, item, keyFn) {
  const key = keyFn(item);
  const idx = list.findIndex((x) => keyFn(x) === key);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}
function mergePrepend(list, item, keyFn) {
  const key = keyFn(item);
  if (list.some((x) => keyFn(x) === key)) return list; // already applied optimistically by this device
  return [item, ...list];
}

export function AppProvider({ children }) {
  const device = loadDeviceState();

  // ---- Shared, backend-sourced state ----
  const [roleDefaults, setRoleDefaults] = useState(initialRoleDefaults);
  const [employees, setEmployees] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [workHistory, setWorkHistory] = useState([]);
  const [panels, setPanels] = useState([]);
  const [pricePerConnection, setPricePerConnectionState] = useState(0.75);
  const [activeSessions, setActiveSessions] = useState([]);
  const [clockLog, setClockLog] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [ready, setReady] = useState(false);

  // Set only while the initial load is actively failing/retrying (never
  // cleared to false until a load actually succeeds). Lets MobileLayout/
  // DesktopLayout show a "can't reach the server, retrying…" screen instead
  // of silently sitting on the plain loading spinner forever — see the
  // initial-load effect below for why this can't just fall through to
  // ready=true on failure like it used to.
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // `saveError` now means "the last read/write against the shared backend
  // failed" (network down, Supabase unreachable) — see SaveErrorBanner,
  // mounted in both layouts.
  const [saveError, setSaveError] = useState(false);

  // ---- Device-local state (who's signed in on this device, and any
  // session currently in progress on it) ----
  const [pendingOverrides, setPendingOverrides] = useState({});
  const [currentUserId, setCurrentUserId] = useState(device?.currentUserId ?? null);
  const [currentAdminId, setCurrentAdminId] = useState(device?.currentAdminId ?? null);
  const [session, setSession] = useState(
    device?.session ?? {
      active: false,
      panel: null,
      stage: null,
      targetConnections: null,
      buildId: null,
      startingProgress: 0,
      startedAt: null,
      notes: "",
    }
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ currentUserId, currentAdminId, session }));
    } catch {
      // Best-effort only — this is small device-local UI state; the real
      // production data lives in Supabase, so a failure here isn't data loss.
    }
  }, [currentUserId, currentAdminId, session]);

  function reportResult({ error } = {}) {
    if (error) {
      console.error("[AssemblyOS backend]", error);
      setSaveError(true);
    } else {
      setSaveError(false);
    }
  }

  function logActivity(action, ref, { who, kind = "scan" } = {}) {
    const item = { id: genId("a"), who: who ?? currentAdmin?.name ?? "Manager", action, ref, time: "just now", kind };
    setActivityFeed((prev) => [item, ...prev]);
    supabase.from("assemblyos_activity_feed").insert(toDbActivity(item)).then(reportResult);
  }

  // ---- Initial load ---------------------------------------------------------
  // IMPORTANT: `ready` must only ever flip to true on a SUCCESSFUL load. It
  // used to flip to true on failure too (with just an error banner) — but
  // that's what was silently logging technicians out. `currentUser` is
  // computed as `employees.find(id === currentUserId)`, so if this fetch
  // fails once and gives up, `employees` stays empty forever and a device
  // that's genuinely already signed in (currentUserId correctly set in
  // localStorage) falls through to the Login screen in MobileLayout/
  // AdminLogin in DesktopLayout — indistinguishable from actually being
  // logged out, and previously unrecoverable without a manual page reload,
  // since nothing retried. A single network blip on shop-floor wifi right
  // when the app opens (or right after a PWA auto-update reload) was enough
  // to trigger this. Now: on failure, keep retrying with capped backoff
  // instead of giving up, and never set `ready` until one succeeds — see
  // `initialLoadFailed`/`retryConnection`, which let the layouts show a
  // "can't reach the server" retry screen instead of Login/AdminLogin while
  // this is in flight.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer;

    async function load() {
      const results = await Promise.all([
        supabase.from("assemblyos_employees").select("*").order("name"),
        supabase.from("assemblyos_admins").select("*").order("name"),
        supabase.from("assemblyos_role_defaults").select("*"),
        supabase.from("assemblyos_settings").select("*"),
        supabase.from("assemblyos_panels").select("*").order("created_at", { ascending: true }),
        supabase.from("assemblyos_work_history").select("*").order("created_at", { ascending: false }),
        supabase.from("assemblyos_active_sessions").select("*"),
        supabase.from("assemblyos_activity_feed").select("*").order("created_at", { ascending: false }).limit(300),
        supabase.from("assemblyos_clock_log").select("*").order("clocked_in_at", { ascending: false }),
      ]);
      if (cancelled) return;
      const [
        employeesRes,
        adminsRes,
        roleDefaultsRes,
        settingsRes,
        panelsRes,
        workHistoryRes,
        activeSessionsRes,
        activityFeedRes,
        clockLogRes,
      ] = results;
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        console.error("[AssemblyOS backend] initial load failed, retrying…", firstError);
        setSaveError(true);
        setInitialLoadFailed(true);
        attempt += 1;
        const delay = Math.min(3000 * 2 ** (attempt - 1), 20000); // 3s, 6s, 12s, 20s, 20s, ...
        timer = setTimeout(load, delay);
        return;
      }

      setEmployees(employeesRes.data.map(fromDbEmployee));
      setAdmins(adminsRes.data.map(fromDbAdmin));
      if (roleDefaultsRes.data.length) {
        const rd = {};
        roleDefaultsRes.data.forEach((r) => {
          rd[r.role] = { daily: Number(r.daily), weekly: Number(r.weekly) };
        });
        setRoleDefaults(rd);
      }
      const priceRow = settingsRes.data.find((s) => s.key === "pricePerConnection");
      if (priceRow) setPricePerConnectionState(Number(priceRow.value));
      setPanels(panelsRes.data.map(fromDbPanel));
      setWorkHistory(workHistoryRes.data.map(fromDbWorkHistory));
      setActiveSessions(activeSessionsRes.data.map(fromDbActiveSession));
      setActivityFeed(activityFeedRes.data.map(fromDbActivity));
      setClockLog(clockLogRes.data.map(fromDbClockLog));
      setSaveError(false);
      setInitialLoadFailed(false);
      setReady(true);
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [retryTick]);

  // Lets a "can't reach the server" retry screen offer an immediate manual
  // retry instead of waiting out the current backoff delay.
  function retryConnection() {
    setRetryTick((t) => t + 1);
  }

  // ---- Realtime sync ---------------------------------------------------------
  // Every device — desktop console and every technician's phone — runs this
  // same subscription, so an insert/update/delete on any table from ANY
  // device shows up live everywhere else within a second or two.
  useEffect(() => {
    const channel = supabase
      .channel("assemblyos-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_employees" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setEmployees((prev) => prev.filter((e) => e.id !== payload.old.id));
        } else {
          setEmployees((prev) => mergeUpsert(prev, fromDbEmployee(payload.new), (e) => e.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_admins" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setAdmins((prev) => prev.filter((a) => a.id !== payload.old.id));
        } else {
          setAdmins((prev) => mergeUpsert(prev, fromDbAdmin(payload.new), (a) => a.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_role_defaults" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        setRoleDefaults((prev) => ({
          ...prev,
          [payload.new.role]: { daily: Number(payload.new.daily), weekly: Number(payload.new.weekly) },
        }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_settings" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        if (payload.new.key === "pricePerConnection") setPricePerConnectionState(Number(payload.new.value));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_panels" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setPanels((prev) => prev.filter((p) => p.buildId !== payload.old.build_id));
        } else {
          setPanels((prev) => mergeUpsert(prev, fromDbPanel(payload.new), (p) => p.buildId));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_work_history" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setWorkHistory((prev) => prev.filter((h) => h.id !== payload.old.id));
        } else if (payload.eventType === "INSERT") {
          setWorkHistory((prev) => mergePrepend(prev, fromDbWorkHistory(payload.new), (h) => h.id));
        } else {
          setWorkHistory((prev) => mergeUpsert(prev, fromDbWorkHistory(payload.new), (h) => h.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_active_sessions" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setActiveSessions((prev) => prev.filter((s) => s.id !== payload.old.id));
        } else {
          setActiveSessions((prev) => mergeUpsert(prev, fromDbActiveSession(payload.new), (s) => s.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_activity_feed" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setActivityFeed((prev) => mergePrepend(prev, fromDbActivity(payload.new), (a) => a.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblyos_clock_log" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setClockLog((prev) => prev.filter((c) => c.id !== payload.old.id));
        } else {
          setClockLog((prev) => mergeUpsert(prev, fromDbClockLog(payload.new), (c) => c.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ---- Goal management actions -------------------------------------------------
  function updateRoleDefault(role, field, value) {
    setRoleDefaults((prev) => ({ ...prev, [role]: { ...prev[role], [field]: value } }));
    supabase.from("assemblyos_role_defaults").update({ [field]: value }).eq("role", role).then(reportResult);
  }

  function setPendingOverride(employeeId, value) {
    setPendingOverrides((prev) => ({ ...prev, [employeeId]: value }));
  }

  function applyGoalChanges() {
    const entries = Object.entries(pendingOverrides);
    setEmployees((prev) =>
      prev.map((emp) => {
        if (!(emp.id in pendingOverrides)) return emp;
        const raw = pendingOverrides[emp.id];
        const parsed = raw === "" || raw === null ? null : Number(raw);
        return { ...emp, override: Number.isFinite(parsed) ? parsed : null };
      })
    );
    entries.forEach(([employeeId, raw]) => {
      const parsed = raw === "" || raw === null ? null : Number(raw);
      supabase
        .from("assemblyos_employees")
        .update({ override: Number.isFinite(parsed) ? parsed : null })
        .eq("id", employeeId)
        .then(reportResult);
    });
    setPendingOverrides({});
  }

  function resetOverride(employeeId) {
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, override: null } : e)));
    setPendingOverrides((prev) => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
    supabase.from("assemblyos_employees").update({ override: null }).eq("id", employeeId).then(reportResult);
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
      id: genId("e"),
      name,
      role,
      payRate: Number(payRate) || 0,
      username,
      override: null,
      currentWeekAvg: 0,
      station: "Unassigned",
      panel: null,
      hasPin: false,
    };
    setEmployees((prev) => [...prev, newEmployee]);
    supabase.from("assemblyos_employees").insert(toDbEmployeeInsert(newEmployee)).then(reportResult);
    logActivity(`added ${name} as a new ${role}`, `@${username}`);
    return { username };
  }

  // Edits an existing roster entry in place — name, role, pay rate, station,
  // whatever the Team Matrix's edit form sends. Username/PIN are untouched
  // (changing those goes through the mobile login flow, not this).
  function updateEmployee(employeeId, fields) {
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, ...fields } : e)));
    supabase.from("assemblyos_employees").update(toDbEmployeeFields(fields)).eq("id", employeeId).then(reportResult);
  }

  // Removes someone from the roster. Their past workHistory/activityFeed
  // entries are left as-is (already rendered with a `?.` fallback to
  // "Unknown Technician" wherever an employee is looked up by id) rather
  // than being deleted too, so production history doesn't silently
  // disappear. Any live session they're in the middle of is ended (the
  // database FK cascades their active-session row), and if they're the one
  // currently signed into the mobile app on THIS device, that session is
  // cleared here too.
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
    supabase.from("assemblyos_employees").delete().eq("id", employeeId).then(reportResult);
    logActivity(`removed ${emp?.name ?? "a team member"} from the roster`, emp ? `@${emp.username}` : "");
  }

  // Admins have desktop console access but aren't part of the technician
  // roster — no role, pay rate, or attainment tracking. Like technicians,
  // they set their own password the first time they log in (see below).
  function addAdmin({ name }) {
    const username = generateUsername(name, allUsernames());
    const id = genId("admin");
    const newAdmin = { id, name, username, password: false };
    setAdmins((prev) => [...prev, newAdmin]);
    supabase.from("assemblyos_admins").insert({ id, name, username }).then(reportResult);
    logActivity(`added ${name} as a new admin`, `@${username}`);
    return { username };
  }

  // ---- Desktop admin login ---------------------------------------------------
  // These now round-trip to the shared backend (assemblyos_check_admin_username
  // / assemblyos_admin_login RPCs), so they're async — Login.jsx and
  // AdminLogin.jsx await them. Credentials themselves (password hashes) are
  // never sent to or readable by the client; the RPC just returns ok/error.
  async function checkAdminUsername(username) {
    const { data, error } = await supabase.rpc("assemblyos_check_admin_username", { p_username: username });
    if (error) return { found: false, serverError: true };
    const row = data?.[0];
    if (!row?.found) return { found: false };
    return { found: true, adminId: row.admin_id, needsSetup: row.needs_setup };
  }

  async function adminLogin(username, password) {
    const { data, error } = await supabase.rpc("assemblyos_admin_login", { p_username: username, p_password: password });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    const row = data?.[0];
    if (!row) return { ok: false, error: "Username not found." };
    if (!row.ok) {
      if (row.needs_setup) return { ok: false, needsSetup: true, adminId: row.admin_id };
      return { ok: false, error: row.error ?? "Incorrect password." };
    }
    setCurrentAdminId(row.admin_id);
    return { ok: true };
  }

  // Sets an admin's password the first time they log in, then signs them in.
  async function setAdminPasswordAndLogin(adminId, password) {
    const { error } = await supabase.rpc("assemblyos_set_admin_password_and_login", {
      p_admin_id: adminId,
      p_password: password,
    });
    if (error) return { ok: false, error: "Couldn't save your password. Check your connection and try again." };
    setAdmins((prev) => prev.map((a) => (a.id === adminId ? { ...a, password: true } : a)));
    setCurrentAdminId(adminId);
    return { ok: true };
  }

  function adminLogout() {
    setCurrentAdminId(null);
  }

  // ---- Mobile login -----------------------------------------------------------
  async function checkUsername(username) {
    const { data, error } = await supabase.rpc("assemblyos_check_username", { p_username: username });
    if (error) return { found: false, serverError: true };
    const row = data?.[0];
    if (!row?.found) return { found: false };
    return { found: true, employeeId: row.employee_id, needsSetup: row.needs_setup };
  }

  async function login(username, pin) {
    const { data, error } = await supabase.rpc("assemblyos_login", { p_username: username, p_pin: pin });
    if (error) return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    const row = data?.[0];
    if (!row) return { ok: false, error: "Username not found." };
    if (!row.ok) {
      if (row.needs_setup) return { ok: false, needsSetup: true, employeeId: row.employee_id };
      return { ok: false, error: row.error ?? "Incorrect PIN." };
    }
    setCurrentUserId(row.employee_id);
    return { ok: true };
  }

  // Sets a technician's PIN the first time they log in, then signs them in.
  async function setPinAndLogin(employeeId, pin) {
    const { error } = await supabase.rpc("assemblyos_set_pin_and_login", { p_employee_id: employeeId, p_pin: pin });
    if (error) return { ok: false, error: "Couldn't save your PIN. Check your connection and try again." };
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, hasPin: true } : e)));
    setCurrentUserId(employeeId);
    return { ok: true };
  }

  function logout() {
    setCurrentUserId(null);
  }

  // ---- Panel estimates -----------------------------------------------------
  function setPricePerConnection(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return;
    setPricePerConnectionState(num);
    supabase
      .from("assemblyos_settings")
      .upsert({ key: "pricePerConnection", value: num }, { onConflict: "key" })
      .then(reportResult);
  }

  // A panel id can come back around — the same panel model built again for
  // a new order. When that happens this appends a brand-new build (its own
  // buildId, its own task progress, its own hours) rather than overwriting
  // the last one, so the manager keeps a full history of every time a given
  // panel has been built. A row only updates the existing entry in place
  // when it looks like the *same* job — its job number matches the current
  // build's (or either side is blank) — treating it as a revised estimate
  // for work that hasn't necessarily started yet, not a new build.
  //
  // A Qty > 1 estimate line item arrives here already split into `qty`
  // separate rows, each with its own suffixed id ("1100012-1", "1100012-2",
  // ...) — see estimateImport.js's pushUnitRows. Each one is matched/
  // created/updated independently by the same id-based logic below, exactly
  // like any other panel; nothing here needs to know quantity was ever
  // involved.
  function importEstimates(rows) {
    if (!rows.length) return;
    const today = new Date().toISOString().slice(0, 10);
    let newBuilds = 0;
    const changed = [];
    setPanels((prev) => {
      const next = [...prev];
      rows.forEach((r) => {
        const currentIdx = next.map((p) => p.id).lastIndexOf(r.id);
        const current = currentIdx !== -1 ? next[currentIdx] : null;
        const sameJob = current && (!r.jobNumber || !current.jobNumber || r.jobNumber === current.jobNumber);

        if (current && sameJob) {
          const updated = {
            ...current,
            customer: r.customer || current.customer || "Unknown Customer",
            order: r.order || current.order || "",
            price: r.price,
            jobNumber: r.jobNumber || current.jobNumber || "",
            poNumber: r.poNumber || current.poNumber || "",
            // pdfId is the object path in the shared assemblyos-pdfs storage
            // bucket (see data/pdfStore.js) — not the file itself, so this
            // stays a small string either way.
            pdfId: r.pdfId || current.pdfId || null,
            pdfFileName: r.pdfFileName || current.pdfFileName || null,
            unitIndex: r.unitIndex ?? current.unitIndex ?? null,
            unitCount: r.unitCount ?? current.unitCount ?? null,
          };
          next[currentIdx] = updated;
          changed.push(updated);
        } else {
          newBuilds += 1;
          const created = {
            id: r.id,
            buildId: genId("b"),
            customer: r.customer || "Unknown Customer",
            order: r.order || "",
            price: r.price,
            // Locked in at import time — not a live lookup — so raising the
            // shop's default rate later never silently reprices work that
            // was already quoted or built.
            pricePerConnection,
            jobNumber: r.jobNumber || "",
            poNumber: r.poNumber || "",
            dateAdded: today,
            pdfId: r.pdfId || null,
            pdfFileName: r.pdfFileName || null,
            unitIndex: r.unitIndex ?? null,
            unitCount: r.unitCount ?? null,
          };
          next.push(created);
          changed.push(created);
        }
      });
      return next;
    });
    supabase
      .from("assemblyos_panels")
      .upsert(
        changed.map((p) => toDbPanel(p)),
        { onConflict: "build_id" }
      )
      .then(reportResult);
    const updated = rows.length - newBuilds;
    logActivity(
      newBuilds && updated
        ? `imported ${newBuilds} new panel build${newBuilds === 1 ? "" : "s"} and updated ${updated} existing`
        : newBuilds
          ? `imported ${newBuilds} panel build${newBuilds === 1 ? "" : "s"}`
          : `updated ${updated} panel estimate${updated === 1 ? "" : "s"}`,
      "QuickBooks Estimate"
    );
  }

  // Manual correction/addition for one build's fields — most commonly the PO
  // number, or fixing a job number/description the PDF parser mis-read.
  // Keyed by buildId, not panel id — a panel id can have more than one
  // build on file.
  function updatePanel(buildId, fields) {
    setPanels((prev) => prev.map((p) => (p.buildId === buildId ? { ...p, ...fields } : p)));
    supabase.from("assemblyos_panels").update(toDbPanelFields(fields)).eq("build_id", buildId).then(reportResult);
  }

  // Removes one build from the schedule entirely (e.g. it was entered by
  // mistake, or the job was cancelled). Any workHistory already logged
  // against it is left as-is.
  function deletePanel(buildId) {
    const panel = panels.find((p) => p.buildId === buildId);
    setPanels((prev) => prev.filter((p) => p.buildId !== buildId));
    supabase.from("assemblyos_panels").delete().eq("build_id", buildId).then(reportResult);
    logActivity(
      `deleted panel #${panel?.jobNumber || panel?.id || ""} from the schedule`,
      panel ? `Panel #${panel.id}` : ""
    );
  }

  // Admin correction for a logged session entry — for mishaps: a technician
  // scanned the wrong stage, mistyped/misremembered hours, the break-window
  // math looked off, etc. See EmployeeDetail.jsx's Recent Activity table.
  // Any subset of fields can be corrected; whatever isn't passed is left
  // alone. This is also the only place `status` is ever set to "Flagged" —
  // every session is stamped "Verified" at creation in stopSession, so
  // flagging an entry for review is itself a manual admin action.
  function updateWorkHistoryEntry(entryId, fields) {
    const before = workHistory.find((h) => h.id === entryId);
    // If the correction includes a new percentAdded, cap it the same way
    // stopSession caps a technician's own session — this one entry can't be
    // set to more than 100% minus whatever every OTHER logged session
    // against the same panel/stage/build already accounts for. Uses the
    // (possibly also-corrected) stage from `fields` when present, since an
    // admin can change the stage in the same edit — the cap should apply
    // against whichever stage the entry ends up filed under, not the one it
    // started with.
    let nextFields = fields;
    if (before && fields.percentAdded !== undefined) {
      const stageForCap = fields.stage ?? before.stage;
      const othersProgress = taskProgress(
        workHistory.filter((h) => h.id !== entryId),
        before.panel,
        stageForCap,
        before.buildId
      );
      const cappedPercent = Math.max(0, Math.min(100 - othersProgress, Number(fields.percentAdded) || 0));
      nextFields = { ...fields, percentAdded: cappedPercent };
    }
    setWorkHistory((prev) => prev.map((h) => (h.id === entryId ? { ...h, ...nextFields } : h)));
    supabase.from("assemblyos_work_history").update(toDbWorkHistoryFields(nextFields)).eq("id", entryId).then(reportResult);
    const emp = employees.find((e) => e.id === before?.employeeId);
    logActivity(
      `corrected a logged session for ${emp?.name ?? "a technician"}`,
      before ? `${before.stage ?? "Session"} · Panel ${before.panel}` : "",
      { kind: "verify" }
    );
  }

  // Removes a logged session entirely — for entries that shouldn't exist at
  // all (e.g. a session started and stopped against the wrong panel by
  // mistake). Unlike deletePanel, there's no "kept but orphaned" fallback
  // here since the entry itself is the mistake being corrected.
  function deleteWorkHistoryEntry(entryId) {
    const before = workHistory.find((h) => h.id === entryId);
    setWorkHistory((prev) => prev.filter((h) => h.id !== entryId));
    supabase.from("assemblyos_work_history").delete().eq("id", entryId).then(reportResult);
    const emp = employees.find((e) => e.id === before?.employeeId);
    logActivity(
      `deleted a logged session for ${emp?.name ?? "a technician"}`,
      before ? `${before.stage ?? "Session"} · Panel ${before.panel}` : "",
      { kind: "verify" }
    );
  }

  // Shared by adminEndSession and clockScan's auto-stop-on-clock-out safety
  // net — both need to turn one activeSessions row into a permanent
  // workHistory entry (or discard it outright) without going through the
  // device-local `session` state stopSession uses, since neither caller is
  // the technician deliberately stopping their own live session in the
  // moment. Defaults to status "Flagged" since every caller of this is some
  // kind of exception path — a stuck session, an auto-ended one at clock-out
  // — worth a manager's second look rather than trusted at face value like a
  // normal stopSession entry.
  function finalizeActiveSession(activeSession, opts = {}) {
    const { hours = 0, percentAdded = 0, connectionsCredited = 0, taskCompleted = false, status = "Flagged", discard = false } = opts;
    setActiveSessions((prev) => prev.filter((s) => s.id !== activeSession.id));
    supabase.from("assemblyos_active_sessions").delete().eq("id", activeSession.id).then(reportResult);
    if (discard) return null;

    // Same remaining-capacity cap stopSession applies to a technician's own
    // session — an admin closing out someone else's stuck/auto-ended
    // session shouldn't be able to push a task's cumulative progress past
    // 100% either, even by mistake (e.g. re-entering the full elapsed
    // session's worth of progress on a task that was already mostly done
    // by someone else in the meantime).
    const startingProgress = taskProgress(workHistory, activeSession.panel, activeSession.stage, activeSession.buildId);
    const cappedPercent = Math.max(0, Math.min(100 - startingProgress, Number(percentAdded) || 0));
    const now = new Date();
    const entry = {
      id: genId("h"),
      employeeId: activeSession.employeeId,
      date: now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      panel: activeSession.panel,
      stage: activeSession.stage,
      buildId: activeSession.buildId,
      percentAdded: cappedPercent,
      taskCompleted: !!taskCompleted || startingProgress + cappedPercent >= 100,
      connectionsCredited: Math.max(0, Number(connectionsCredited) || 0),
      panels: 1,
      hours: Math.max(0, Number(hours) || 0),
      status,
      createdAt: now.toISOString(),
      // The real scan-in time (from the active session this closes out) to
      // whenever this finalize call happened — same "what time to what
      // time" record a normal stopSession entry gets, even though the
      // *hours* credited here may be a manually-corrected number rather
      // than the literal span between these two timestamps (that's the
      // whole point of this path — the raw elapsed time isn't trusted).
      startedAt: activeSession.startedAt ? new Date(activeSession.startedAt).toISOString() : null,
      endedAt: now.toISOString(),
    };
    setWorkHistory((prev) => [entry, ...prev]);
    supabase.from("assemblyos_work_history").insert(toDbWorkHistory(entry)).then(reportResult);
    return entry;
  }

  // Admin-initiated: force-ends another employee's stuck/runaway active
  // session from the desktop console (they forgot to scan out and it's
  // been running for hours — see the "Currently scanned in" list on a
  // panel's detail view). The runaway elapsed time itself is never trusted
  // — the admin supplies the actual hours/progress/connections to credit,
  // or discards the session entirely with nothing logged if it shouldn't be
  // credited at all (e.g. a stray scan). Also clears this device's own
  // local `session` state if the admin happens to be looking at this on the
  // same device the technician is signed into.
  function adminEndSession(activeSession, opts = {}) {
    const emp = employees.find((e) => e.id === activeSession.employeeId);
    const entry = finalizeActiveSession(activeSession, opts);
    if (currentUserId === activeSession.employeeId) {
      setSession({
        active: false,
        panel: null,
        stage: null,
        targetConnections: null,
        buildId: null,
        startingProgress: 0,
        startedAt: null,
        notes: "",
      });
    }
    logActivity(
      entry
        ? `ended a stuck session for ${emp?.name ?? "a technician"} — ${entry.hours} hrs logged (admin correction)`
        : `discarded a stuck session for ${emp?.name ?? "a technician"} (no hours logged)`,
      `${activeSession.stage ?? "Session"} · Panel ${activeSession.panel}`,
      { kind: "verify" }
    );
  }

  // ---- Time clock ---------------------------------------------------------
  // Handles a scan of the shared "master" clock QR (see clockQrValue in
  // mockData.js) — one code posted at the shop's clock-in point, scanned by
  // whoever is signed in on the phone doing the scanning. Toggles based on
  // whether this employee already has an open clockLog row: no open row ->
  // clock in; an open row -> clock out. Clocking out also auto-ends any
  // panel session still running for this employee. `opts.percentAdded`
  // (0-100 or null) is what the technician reported on the pre-clock-out
  // progress prompt (Home.jsx's "how much progress did you make?" modal,
  // shown before the QR scanner opens whenever they have an active
  // session) — when present, it's credited to the session actually running
  // on THIS device exactly like a normal Stop Session would (real
  // percentAdded/connections/completion, "Verified" unless the reported
  // connections/hour rate itself trips the same review threshold a normal
  // Stop Session checks). Any OTHER still-open session for this employee
  // (a stray from a different device, or one this device lost track of)
  // has no progress info to go on and keeps the original safety-net
  // treatment: 0% logged, "Flagged" for a manager to review.
  function clockScan(rawValue, opts = {}) {
    const parsed = parseClockQrValue(rawValue);
    if (!parsed) return { ok: false, error: "That doesn't look like the shop's clock QR code." };
    if (!isValidClockWeek(parsed.weekKey)) {
      return { ok: false, error: "This clock sheet is from a previous week — ask your manager for this week's printout." };
    }
    if (!currentUserId) return { ok: false, error: "You're not signed in." };

    const now = Date.now();
    const openEntry = clockLog.find((c) => c.employeeId === currentUserId && !c.clockedOutAt);

    if (!openEntry) {
      const entry = { id: genId("clk"), employeeId: currentUserId, clockedInAt: now, clockedOutAt: null, hours: null };
      setClockLog((prev) => [entry, ...prev]);
      supabase.from("assemblyos_clock_log").insert(toDbClockLog(entry)).then(reportResult);
      logActivity("clocked in", "", { who: currentUser?.name ?? "Technician", kind: "scan" });
      return { ok: true, type: "in" };
    }

    // Raw gross duration (no break subtraction) — a presence record, not a
    // "hours worked" figure; see the comment on toDbClockLog.
    const grossHours = Number(((now - openEntry.clockedInAt) / 3600000).toFixed(2));
    setClockLog((prev) => prev.map((c) => (c.id === openEntry.id ? { ...c, clockedOutAt: now, hours: grossHours } : c)));
    supabase
      .from("assemblyos_clock_log")
      .update({ clocked_out_at: new Date(now).toISOString(), hours: grossHours })
      .eq("id", openEntry.id)
      .then(reportResult);

    const { percentAdded = null } = opts;
    const stuckSessions = activeSessions.filter((s) => s.employeeId === currentUserId);
    let flaggedCount = 0;
    stuckSessions.forEach((s) => {
      const hours = Number((effectiveElapsedMs(s.startedAt, now) / 3600000).toFixed(2));
      const isThisDeviceSession =
        session.active && s.panel === session.panel && s.stage === session.stage && s.buildId === session.buildId;

      if (isThisDeviceSession && percentAdded !== null) {
        const startingProgress = taskProgress(workHistory, s.panel, s.stage, s.buildId);
        const pct = Math.max(0, Math.min(100 - startingProgress, Number(percentAdded) || 0));
        const isComplete = startingProgress + pct >= 100;
        const isConnectStage = s.stage === CONNECT_STAGE_LABEL;
        const connectionsCredited =
          isConnectStage && session.targetConnections ? Math.round((pct / 100) * session.targetConnections) : 0;
        const rate = connectionsPerHour(connectionsCredited, hours);
        const rateFlagged = rate !== null && rate > CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD;
        finalizeActiveSession(s, {
          hours,
          percentAdded: pct,
          taskCompleted: isComplete,
          connectionsCredited,
          status: rateFlagged ? "Flagged" : "Verified",
        });
        if (rateFlagged) flaggedCount++;
      } else {
        // No reported progress to credit (a stray session this clock-out
        // wasn't prompted for) — same original safety-net treatment.
        finalizeActiveSession(s, { hours, percentAdded: 0, status: "Flagged" });
        flaggedCount++;
      }
    });
    if (session.active) {
      setSession({
        active: false,
        panel: null,
        stage: null,
        targetConnections: null,
        buildId: null,
        startingProgress: 0,
        startedAt: null,
        notes: "",
      });
    }

    logActivity(
      stuckSessions.length > 0
        ? `clocked out — ${stuckSessions.length} session${stuckSessions.length === 1 ? "" : "s"} auto-ended${flaggedCount > 0 ? ` (${flaggedCount} flagged for review)` : ""}`
        : "clocked out",
      "",
      { who: currentUser?.name ?? "Technician", kind: stuckSessions.length > 0 ? "verify" : "scan" }
    );
    return {
      ok: true,
      type: "out",
      autoEndedSessions: stuckSessions.length,
      autoEndedFlagged: flaggedCount,
      hours: grossHours,
    };
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
  // (a shared, live table now — not simulated) so it shows up on the manager
  // Panels page, and on every other device, in real time.
  //
  // Wiring work isn't done in countable discrete units, so instead of tallying
  // a live count during the session, the technician reports how much of the
  // (panel, stage) task their session actually completed (in 10% increments)
  // when they stop. taskProgress() sums those contributions across everyone
  // who has worked the task, so credit for a task finished across multiple
  // people/days splits by what each person actually reported.
  function startSession(panel, stage, targetConnections = null, buildId = null) {
    const startingProgress = taskProgress(workHistory, panel, stage, buildId);
    const startedAt = Date.now();
    setSession({ active: true, panel, stage, targetConnections, buildId, startingProgress, startedAt, notes: "" });
    const liveId = `live-${currentUserId}`;
    setActiveSessions((prev) => [
      ...prev.filter((s) => s.employeeId !== currentUserId),
      { id: liveId, employeeId: currentUserId, panel, stage, buildId, startedAt },
    ]);
    supabase
      .from("assemblyos_active_sessions")
      .upsert(
        { id: liveId, employee_id: currentUserId, panel, stage, build_id: buildId, started_at: new Date(startedAt).toISOString() },
        { onConflict: "employee_id" }
      )
      .then(reportResult);
    logActivity(`started ${stage.toLowerCase()} session`, `Panel ${panel}`, {
      who: currentUser?.name ?? "Technician",
    });
  }

  function setSessionNotes(notes) {
    setSession((prev) => ({ ...prev, notes }));
  }

  // percentAdded: how much of the task this session completed, already
  // clamped by the caller to [0, 100 - session.startingProgress]. This is the
  // only way work gets logged — every workHistory row traces back to an
  // actual scan-in/scan-out session. For the Route/Terminate stage
  // specifically, the percentage reported converts directly into a
  // connection count against the panel's target.
  //
  // opts.reworkReason/reworkRootCause/reworkAttributedToId: only meaningful
  // when session.stage is the Rework stage — ActiveSession.jsx's Stop
  // Session flow requires all three before it will even call this for a
  // Rework session, so it can enforce that requirement in the UI (disabled
  // Confirm button) rather than here. stopSession itself doesn't re-enforce
  // it — same trust boundary as percentAdded, which the caller already
  // clamps before calling this.
  function stopSession(percentAdded, opts = {}) {
    if (!session.active) return;
    const { reworkReason = null, reworkRootCause = null, reworkAttributedToId = null } = opts;
    const isReworkStage = session.stage === REWORK_STAGE_LABEL;
    // Paid break windows (9:15–9:30, 11:00–11:30, 3:15–3:30 every day) are
    // never counted as logged work — effectiveElapsedMs subtracts whatever
    // portion of this session's wall-clock span fell inside one, regardless
    // of when the session actually started or stopped relative to it.
    const stoppedAt = Date.now();
    const hours = effectiveElapsedMs(session.startedAt, stoppedAt) / 3600000;
    const pct = Math.max(0, Math.min(100 - session.startingProgress, percentAdded ?? 0));
    const isComplete = session.startingProgress + pct >= 100;
    const isConnectStage = session.stage === CONNECT_STAGE_LABEL;
    const connectionsCredited =
      isConnectStage && session.targetConnections ? Math.round((pct / 100) * session.targetConnections) : 0;
    const rate = connectionsPerHour(connectionsCredited, hours);
    // Auto-flag a single session that reports more connections/hour than
    // the review threshold — see connectionsPerHour's comment in
    // mockData.js. Every other session still stamps "Verified" at creation
    // like before; this is the one other place (besides the manual admin
    // tools) status can come out of stopSession as "Flagged", and it's a
    // real automatic check rather than a human deciding to flag it.
    const rateFlagged = rate !== null && rate > CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD;
    const entry = {
      id: genId("h"),
      employeeId: currentUserId,
      date: new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      panel: session.panel,
      stage: session.stage,
      buildId: session.buildId,
      percentAdded: pct,
      taskCompleted: isComplete,
      connectionsCredited,
      panels: 1,
      hours: Math.max(0.1, Number(hours.toFixed(1))),
      status: rateFlagged ? "Flagged" : "Verified",
      // Local approximation so this session shows up in analytics trend
      // charts immediately, without waiting on the DB round trip that
      // eventually confirms the real created_at (see fromDbWorkHistory).
      createdAt: new Date(stoppedAt).toISOString(),
      // Real clock-in/clock-out times for this session — "what time to
      // what time" — shown wherever a logged session is listed
      // (formatTimeRange in ui.jsx). session.startedAt is the actual
      // Date.now() captured when the technician scanned in (startSession);
      // stoppedAt is this same moment, captured once above so the elapsed-
      // hours math and the displayed end time never drift apart.
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(stoppedAt).toISOString(),
      reworkReason: isReworkStage ? reworkReason : null,
      reworkRootCause: isReworkStage ? reworkRootCause : null,
      reworkAttributedToId: isReworkStage ? reworkAttributedToId : null,
    };
    setWorkHistory((prev) => [entry, ...prev]);
    supabase.from("assemblyos_work_history").insert(toDbWorkHistory(entry)).then(reportResult);

    logActivity(
      (isComplete
        ? `completed ${session.stage.toLowerCase()}`
        : `logged ${pct}% progress on ${session.stage.toLowerCase()} (now ${session.startingProgress + pct}%)`) +
        (connectionsCredited > 0 ? ` · +${connectionsCredited} connections` : "") +
        (rateFlagged
          ? ` · flagged for review — ${rate} conn/hr exceeds the ${CONNECTIONS_PER_HOUR_REVIEW_THRESHOLD}/hr threshold`
          : ""),
      `Panel ${session.panel}`,
      { who: currentUser?.name ?? "Technician", kind: isComplete ? "verify" : "scan" }
    );

    setActiveSessions((prev) => prev.filter((s) => s.employeeId !== currentUserId));
    supabase.from("assemblyos_active_sessions").delete().eq("employee_id", currentUserId).then(reportResult);
    setSession({
      active: false,
      panel: null,
      stage: null,
      targetConnections: null,
      buildId: null,
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
    ready,
    initialLoadFailed,
    retryConnection,
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
    clockLog,
    clockScan,
    adminEndSession,
    currentUser,
    admins,
    currentAdmin,
    session,
    saveError,
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
    updatePanel,
    deletePanel,
    updateWorkHistoryEntry,
    deleteWorkHistoryEntry,
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
