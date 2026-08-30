import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useApp } from "../../context/AppContext";
import { ROLES, ROLE_META, generateDailyOutput } from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Button, formatNumber } from "../../components/ui";

const RANGE_OPTIONS = ["This Month", "Last 7 Days", "Last 30 Days", "Custom"];
const ROLE_FILTERS = ["All Roles", ...Object.values(ROLES)];

export default function Reports() {
  const { employees, roleDefaults, workHistory } = useApp();
  const [range, setRange] = useState("This Month");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");

  const filteredEmployees = useMemo(
    () =>
      employees.filter((e) => {
        if (roleFilter !== "All Roles" && e.role !== roleFilter) return false;
        if (employeeFilter !== "All Employees" && e.name !== employeeFilter) return false;
        return true;
      }),
    [employees, roleFilter, employeeFilter]
  );

  const chartData = useMemo(
    () =>
      generateDailyOutput(
        30,
        employees.reduce((sum, e) => sum + (e.override ?? roleDefaults[e.role].daily), 0)
      ),
    [employees, roleDefaults]
  );
  const totalHours = chartData.reduce((s, d) => s + d.value, 0);

  const avgAttainment = useMemo(() => {
    if (!filteredEmployees.length) return 0;
    return Math.round(
      filteredEmployees.reduce((s, e) => s + e.attainmentPct, 0) / filteredEmployees.length
    );
  }, [filteredEmployees]);

  const topPerformer = useMemo(() => {
    if (!filteredEmployees.length) return null;
    return [...filteredEmployees].sort((a, b) => b.attainmentPct - a.attainmentPct)[0];
  }, [filteredEmployees]);

  // Hours logged per role, derived from real work history — not a fixture.
  const outputByRole = useMemo(() => {
    const totals = {};
    Object.values(ROLES).forEach((r) => (totals[r] = 0));
    workHistory.forEach((h) => {
      const emp = employees.find((e) => e.id === h.employeeId);
      if (emp) totals[emp.role] += h.hours;
    });
    return Object.entries(totals).map(([role, value]) => ({ role, value: Number(value.toFixed(1)) }));
  }, [workHistory, employees]);

  const filteredOutputByRole = useMemo(() => {
    const source = roleFilter === "All Roles" ? outputByRole : outputByRole.filter((r) => r.role === roleFilter);
    const max = Math.max(...source.map((r) => r.value), 1);
    return source.map((r) => ({ ...r, pct: (r.value / max) * 100 }));
  }, [outputByRole, roleFilter]);

  const panelsShipped = useMemo(
    () => workHistory.filter((h) => h.stage === "QC/Wrap" && h.taskCompleted).length,
    [workHistory]
  );

  function exportAs(kind) {
    // Client-side "export": builds a CSV/text blob from live state and triggers a download.
    const rows = [
      ["Employee", "Role", "Current Week Avg", "Attainment %"],
      ...filteredEmployees.map((e) => [e.name, e.role, e.currentWeekAvg, e.attainmentPct]),
    ];
    const content = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([content], { type: kind === "csv" ? "text/csv" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance-report.${kind === "csv" ? "csv" : "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Performance Reports</h1>
          <p className="text-sm text-ink-500 mt-1">Run and review employee control panel production metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => exportAs("csv")}>Export CSV</Button>
          <Button onClick={() => exportAs("pdf")}>Generate Report</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          {ROLE_FILTERS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] font-medium text-ink-700"
        >
          <option>All Employees</option>
          {employees.map((e) => (
            <option key={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Team Total Hours" value={formatNumber(totalHours)} sub="This 30-day period" accent="text-brand-600" />
        <StatCard label="AVG Goal Attainment" value={`${avgAttainment}%`} sub="Target: 100% Sustained" />
        <StatCard label="Top Performer" value={topPerformer ? topPerformer.name.split(" ")[0] + " " + topPerformer.name.split(" ")[1][0] + "." : "—"} sub={topPerformer ? `${topPerformer.attainmentPct}% attainment` : ""} />
        <StatCard label="Panels Shipped" value={panelsShipped} sub="QC/Wrap completed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <Card className="lg:col-span-2">
          <SectionTitle title="Daily Team Hours Logged" subtitle={`Total: ${formatNumber(totalHours)} hrs`} />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillOutput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b6fe0" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b6fe0" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#eef2f6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip formatter={(v) => [`${formatNumber(v)} hours`, "Output"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8ee" }} />
              <Area type="monotone" dataKey="value" stroke="#3b6fe0" strokeWidth={2} fill="url(#fillOutput)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle title="Output by Assembly Role" />
          <div className="space-y-4 mt-2">
            {filteredOutputByRole.map((r) => {
              const meta = ROLE_META[r.role];
              return (
                <div key={r.role}>
                  <div className="flex items-center justify-between mb-1">
                    <RoleBadge role={r.role} />
                    <span className="text-xs font-semibold text-ink-900">{formatNumber(r.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-paper-100 overflow-hidden">
                    <div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <SectionTitle title="Employee Performance" subtitle={`${filteredEmployees.length} technician(s) matching filters`} />
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Current Week Avg</th>
              <th className="px-4 py-3 font-semibold">Attainment</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((e, i) => (
              <tr key={e.id} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-ink-900">{e.name}</td>
                <td className="px-4 py-2.5"><RoleBadge role={e.role} /></td>
                <td className="px-4 py-2.5 text-ink-700">{e.currentWeekAvg}</td>
                <td className="px-4 py-2.5 font-semibold text-ink-900">{e.attainmentPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
