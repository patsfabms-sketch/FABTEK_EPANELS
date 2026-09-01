import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useApp } from "../../context/AppContext";
import { ROLES, ROLE_META, isClockedIn, isoWeekKey, clockQrValue } from "../../data/mockData";
import { Card, SectionTitle, RoleBadge, AttainmentPill, Button, Modal } from "../../components/ui";

export default function Team() {
  const { employees, admins, workHistory, clockLog, addEmployee, updateEmployee, deleteEmployee, addAdmin } = useApp();
  const navigate = useNavigate();
  const [showClockQr, setShowClockQr] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("attainmentPct");
  const [sortDir, setSortDir] = useState("desc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddAdminForm, setShowAddAdminForm] = useState(false);
  const [newCredentials, setNewCredentials] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deletingEmployee, setDeletingEmployee] = useState(null);

  const rows = useMemo(() => {
    const filtered = employees.filter((e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) || e.role.toLowerCase().includes(query.toLowerCase())
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [employees, query, sortKey, sortDir]);

  const roleCounts = useMemo(() => {
    const counts = {};
    Object.values(ROLES).forEach((r) => (counts[r] = 0));
    employees.forEach((e) => (counts[e.role] += 1));
    return counts;
  }, [employees]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Team Matrix</h1>
          <p className="text-sm text-ink-500 mt-1">Roster, roles, and live attainment across the floor</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or role…"
            className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] w-64"
          />
          <Button variant="ghost" onClick={() => setShowClockQr(true)}>
            Print This Week's Clock QR
          </Button>
          <Button onClick={() => setShowAddForm(true)}>+ Add Team Member</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-xl">
        {Object.values(ROLES).map((role) => {
          const meta = ROLE_META[role];
          return (
            <Card key={role} className="flex items-center justify-between">
              <div>
                <RoleBadge role={role} />
                <p className="text-2xl font-bold text-ink-900 mt-2">{roleCounts[role]}</p>
                <p className="text-[11px] text-ink-500">technicians</p>
              </div>
              <div className={`w-9 h-9 rounded-full ${meta.bg} ${meta.color} flex items-center justify-center font-bold text-sm`}>
                {roleCounts[role]}
              </div>
            </Card>
          );
        })}
      </div>

      <SectionTitle title={`Roster (${rows.length})`} subtitle="Click a column header to sort" />
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <Th label="Employee" onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir} />
              <Th label="Role" onClick={() => toggleSort("role")} active={sortKey === "role"} dir={sortDir} />
              <th className="px-4 py-3 font-semibold">Station</th>
              <th className="px-4 py-3 font-semibold">Clock Status</th>
              <th className="px-4 py-3 font-semibold">Active Panel</th>
              <Th label="Current Avg" onClick={() => toggleSort("currentWeekAvg")} active={sortKey === "currentWeekAvg"} dir={sortDir} />
              <Th label="Attainment" onClick={() => toggleSort("attainmentPct")} active={sortKey === "attainmentPct"} dir={sortDir} />
              <Th label="Pay Rate" onClick={() => toggleSort("payRate")} active={sortKey === "payRate"} dir={sortDir} />
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr
                key={e.id}
                onClick={() => navigate(`/team/${e.id}`)}
                className={`cursor-pointer hover:bg-brand-50/40 border-b border-paper-100 last:border-0 ${
                  i % 2 === 1 ? "bg-paper-50/60" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-ink-900 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
                    {e.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  {e.name}
                </td>
                <td className="px-4 py-2.5"><RoleBadge role={e.role} /></td>
                <td className="px-4 py-2.5 text-ink-600">{e.station}</td>
                <td className="px-4 py-2.5">
                  <ClockStatusBadge clockLog={clockLog} employeeId={e.id} />
                </td>
                <td className="px-4 py-2.5 text-ink-600">{e.panel ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-700 font-medium">{e.currentWeekAvg}</td>
                <td className="px-4 py-2.5"><AttainmentPill pct={e.attainmentPct} /></td>
                <td className="px-4 py-2.5 text-ink-700 font-medium">${e.payRate?.toFixed(2)}/hr</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEditingEmployee(e);
                      }}
                      className="text-[12px] font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setDeletingEmployee(e);
                      }}
                      className="text-[12px] font-semibold text-bad-600 hover:text-bad-700"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between mt-8 mb-4">
        <SectionTitle
          title={`Admins (${admins.length})`}
          subtitle="Who can log into this desktop console — no pay rate or roster attainment"
        />
        <Button variant="ghost" onClick={() => setShowAddAdminForm(true)}>
          + Add Admin
        </Button>
      </div>
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Username</th>
              <th className="px-4 py-3 font-semibold">Access</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a, i) => (
              <tr key={a.id} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-ink-900 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
                    {a.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  {a.name}
                </td>
                <td className="px-4 py-2.5 text-ink-600">@{a.username}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                      a.password ? "bg-good-50 text-good-600" : "bg-warn-50 text-warn-600"
                    }`}
                  >
                    {a.password ? "Password set" : "Awaiting first login"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showAddForm && (
        <AddTeamMemberModal
          onClose={() => setShowAddForm(false)}
          onCreate={(form) => {
            const credentials = addEmployee(form);
            setShowAddForm(false);
            setNewCredentials({ name: form.name, kind: "technician", ...credentials });
          }}
        />
      )}

      {showAddAdminForm && (
        <AddAdminModal
          onClose={() => setShowAddAdminForm(false)}
          onCreate={(form) => {
            const credentials = addAdmin(form);
            setShowAddAdminForm(false);
            setNewCredentials({ name: form.name, kind: "admin", ...credentials });
          }}
        />
      )}

      {newCredentials && (
        <CredentialsModal credentials={newCredentials} onClose={() => setNewCredentials(null)} />
      )}

      {editingEmployee && (
        <EditTeamMemberModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={(fields) => {
            updateEmployee(editingEmployee.id, fields);
            setEditingEmployee(null);
          }}
        />
      )}

      {deletingEmployee && (
        <DeleteEmployeeModal
          employee={deletingEmployee}
          hasHistory={workHistory.some((h) => h.employeeId === deletingEmployee.id)}
          onClose={() => setDeletingEmployee(null)}
          onConfirm={() => {
            deleteEmployee(deletingEmployee.id);
            setDeletingEmployee(null);
          }}
        />
      )}

      {showClockQr && <ClockQrModal onClose={() => setShowClockQr(false)} />}
    </div>
  );
}

// Live "clocked in since HH:MM" / "not clocked in" status per technician —
// driven by AppContext.clockLog, so it updates in real time as the shop
// scans in/out on the shared clock QR (see ClockQrModal below).
function ClockStatusBadge({ clockLog, employeeId }) {
  if (!isClockedIn(clockLog, employeeId)) {
    return <span className="text-[11px] text-ink-400">Not clocked in</span>;
  }
  const open = clockLog.find((c) => c.employeeId === employeeId && !c.clockedOutAt);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-good-600">
      <span className="w-1.5 h-1.5 rounded-full bg-good-500 animate-pulse" />
      Since {new Date(open.clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

// Generates and prints this week's master clock QR — one sheet, posted at
// the shop's clock-in point, that every technician scans with their own
// phone (already signed in as themselves) to clock in on arrival and clock
// out at the end of the day. It encodes the current ISO week (see
// isoWeekKey/clockQrValue in mockData.js), so a stale printout stops
// working once the week rolls over (with a one-week grace period — see
// isValidClockWeek) rather than staying valid forever if it's ever
// photographed and used from off-site.
function ClockQrModal({ onClose }) {
  const weekKey = useMemo(() => isoWeekKey(), []);
  const value = useMemo(() => clockQrValue(weekKey), [weekKey]);
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 640, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't generate the QR code. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <Modal onClose={onClose} widthClass="max-w-sm">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-base font-bold text-ink-900">This Week's Clock QR</h3>
        <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700 text-xl leading-none px-1">
          ×
        </button>
      </div>

      <div className="flex justify-center mb-3">
        <div className="rounded-lg border border-paper-200 bg-white p-3">
          {dataUrl ? (
            <img src={dataUrl} alt="This week's clock QR code" width={200} height={200} />
          ) : error ? (
            <p className="text-xs text-bad-600 w-[200px] text-center py-16">{error}</p>
          ) : (
            <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-ink-400">Generating…</div>
          )}
        </div>
      </div>
      <p className="text-center text-[12px] font-semibold text-ink-900">Week of {weekKey}</p>
      <p className="text-center text-[11px] text-ink-500 mb-5">
        Post this where everyone clocks in. Every technician scans it with their own phone — once on arrival, once
        on the way out. Print a fresh one each week; last week's stays valid for a one-week grace period, then
        stops working.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => window.print()} disabled={!dataUrl}>
          <PrinterIcon /> Print
        </Button>
      </div>

      {dataUrl &&
        createPortal(
          <div id="clock-qr-print-area">
            <style>{`
              #clock-qr-print-area { display: none; }
              @media print {
                body > #root { display: none !important; }
                #clock-qr-print-area {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  gap: 0.2in;
                }
                #clock-qr-print-area img { width: 4in; height: 4in; }
                #clock-qr-print-area p { font-size: 14pt; font-weight: 700; margin: 0; }
                #clock-qr-print-area span { font-size: 10pt; color: #444; }
                @page { size: letter; margin: 0; }
              }
            `}</style>
            <img src={dataUrl} alt="This week's clock QR code" />
            <p>Scan to Clock In / Clock Out</p>
            <span>Week of {weekKey}</span>
          </div>,
          document.body
        )}
    </Modal>
  );
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddTeamMemberModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES.TECH);
  const [payRate, setPayRate] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!name.trim()) {
      setError("Enter the technician's name.");
      return;
    }
    if (!payRate || Number(payRate) <= 0) {
      setError("Enter a pay rate greater than 0.");
      return;
    }
    setError("");
    onCreate({ name: name.trim(), role, payRate: Number(payRate) });
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-popover p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-900">Add Team Member</h3>
          <button onClick={onClose} className="text-ink-400 text-lg leading-none">
            ×
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-ink-500">Full Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya Nair"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs font-semibold text-ink-500">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm bg-white"
          >
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block mb-4">
          <span className="text-xs font-semibold text-ink-500">Pay Rate</span>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-sm text-ink-500">$</span>
            <input
              type="number"
              step="0.25"
              min="0"
              value={payRate}
              onChange={(e) => setPayRate(e.target.value)}
              placeholder="25.00"
              className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
            />
            <span className="text-xs text-ink-500">/hr</span>
          </div>
        </label>

        {error && <p className="text-[11px] text-bad-600 mb-3">{error}</p>}

        <Button className="w-full py-2.5" onClick={handleSubmit}>
          Create Team Member
        </Button>
      </div>
    </div>
  );
}

function EditTeamMemberModal({ employee, onClose, onSave }) {
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);
  const [station, setStation] = useState(employee.station ?? "");
  const [payRate, setPayRate] = useState(String(employee.payRate ?? ""));
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!name.trim()) {
      setError("Enter the technician's name.");
      return;
    }
    if (!payRate || Number(payRate) <= 0) {
      setError("Enter a pay rate greater than 0.");
      return;
    }
    setError("");
    onSave({
      name: name.trim(),
      role,
      station: station.trim() || "Unassigned",
      payRate: Number(payRate),
    });
  }

  return (
    <Modal onClose={onClose} widthClass="max-w-[380px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink-900">Edit Team Member</h3>
        <button onClick={onClose} className="text-ink-400 text-lg leading-none">
          ×
        </button>
      </div>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Full Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm bg-white"
        >
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-3">
        <span className="text-xs font-semibold text-ink-500">Station</span>
        <input
          value={station}
          onChange={(e) => setStation(e.target.value)}
          placeholder="e.g. Bench 3"
          className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block mb-4">
        <span className="text-xs font-semibold text-ink-500">Pay Rate</span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm text-ink-500">$</span>
          <input
            type="number"
            step="0.25"
            min="0"
            value={payRate}
            onChange={(e) => setPayRate(e.target.value)}
            className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
          <span className="text-xs text-ink-500">/hr</span>
        </div>
      </label>

      <p className="text-[11px] text-ink-400 mb-4">
        Username (@{employee.username}) and PIN aren't changed here — those are set by the technician on
        the mobile app.
      </p>

      {error && <p className="text-[11px] text-bad-600 mb-3">{error}</p>}

      <Button className="w-full py-2.5" onClick={handleSubmit}>
        Save Changes
      </Button>
    </Modal>
  );
}

function DeleteEmployeeModal({ employee, hasHistory, onClose, onConfirm }) {
  return (
    <Modal onClose={onClose} widthClass="max-w-[380px]">
      <h3 className="text-sm font-semibold text-ink-900 mb-2">Remove {employee.name}?</h3>
      <p className="text-[12px] text-ink-500 mb-2">
        They'll be removed from the roster and won't be able to log in as @{employee.username} anymore.
        Any panel they're currently scanned into will be ended.
      </p>
      {hasHistory && (
        <p className="text-[12px] text-warn-600 mb-2">
          This technician has logged production history. It stays on record, but will show as "Unknown
          Technician" once they're removed.
        </p>
      )}
      <p className="text-[11px] text-ink-400 mb-5">This can't be undone from here.</p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Delete Team Member
        </Button>
      </div>
    </Modal>
  );
}

function AddAdminModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!name.trim()) {
      setError("Enter the admin's name.");
      return;
    }
    setError("");
    onCreate({ name: name.trim() });
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-popover p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-900">Add Admin</h3>
          <button onClick={onClose} className="text-ink-400 text-lg leading-none">
            ×
          </button>
        </div>

        <label className="block mb-4">
          <span className="text-xs font-semibold text-ink-500">Full Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan Blake"
            className="mt-1 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-[11px] text-ink-400 mb-4">
          Admins get full desktop console access. No pay rate or roster tracking — that's just for technicians.
        </p>

        {error && <p className="text-[11px] text-bad-600 mb-3">{error}</p>}

        <Button className="w-full py-2.5" onClick={handleSubmit}>
          Create Admin
        </Button>
      </div>
    </div>
  );
}

function CredentialsModal({ credentials, onClose }) {
  const isAdmin = credentials.kind === "admin";
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-popover p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink-900 mb-1">{credentials.name} was added ✓</h3>
        <p className="text-[11px] text-ink-500 mb-4">
          Share this username with them. The first time they log in with it, they'll be prompted to set their own{" "}
          {isAdmin ? "password" : "4-digit PIN"}.
        </p>

        <div className="rounded-lg bg-paper-50 border border-paper-200 px-3 py-2.5 mb-4">
          <p className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">Username</p>
          <p className="text-sm font-semibold text-ink-900 tabular-nums">{credentials.username}</p>
        </div>

        <Button className="w-full py-2.5" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Th({ label, onClick, active, dir }) {
  return (
    <th className="px-4 py-3 font-semibold cursor-pointer select-none" onClick={onClick}>
      <span className={active ? "text-ink-900" : ""}>
        {label} {active && (dir === "asc" ? "↑" : "↓")}
      </span>
    </th>
  );
}
