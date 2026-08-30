import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { initialRoleDefaults, attainment, taskProgress, generateUsername, CONNECT_STAGE_LABEL } from "../data/mockData";

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
  dateAdded: "date_added",
  pdfId: "pdf_path",
  pdfFileName: "pdf_file_name",
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
    dateAdded: row.date_added,
    pdfId: row.pdf_path,
    pdfFileName: row.pdf_file_name,
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
  };
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
  const [admins, setAdmins] = useState([]);
  const [ready, setReady] = useState(false);

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
  useEffect(() => {
    let cancelled = false;
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
      ]);
      if (cancelled) return;
      const [employeesRes, adminsRes, roleDefaultsRes, settingsRes, panelsRes, workHistoryRes, activeSessionsRes, activityFeedRes] =
        results;
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        console.error("[AssemblyOS backend] initial load failed", firstError);
        setSaveError(true);
        setReady(true);
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
      setSaveError(false);
      setReady(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
  function stopSession(percentAdded) {
    if (!session.active) return;
    const hours = session.startedAt ? (Date.now() - session.startedAt) / 3600000 : 0;
    const pct = Math.max(0, Math.min(100 - session.startingProgress, percentAdded ?? 0));
    const isComplete = session.startingProgress + pct >= 100;
    const isConnectStage = session.stage === CONNECT_STAGE_LABEL;
    const connectionsCredited =
      isConnectStage && session.targetConnections ? Math.round((pct / 100) * session.targetConnections) : 0;
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
      status: "Verified",
      // Local approximation so this session shows up in analytics trend
      // charts immediately, without waiting on the DB round trip that
      // eventually confirms the real created_at (see fromDbWorkHistory).
      createdAt: new Date().toISOString(),
    };
    setWorkHistory((prev) => [entry, ...prev]);
    supabase.from("assemblyos_work_history").insert(toDbWorkHistory(entry)).then(reportResult);

    logActivity(
      (isComplete
        ? `completed ${session.stage.toLowerCase()}`
        : `logged ${pct}% progress on ${session.stage.toLowerCase()} (now ${session.startingProgress + pct}%)`) +
        (connectionsCredited > 0 ? ` · +${connectionsCredited} connections` : ""),
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
