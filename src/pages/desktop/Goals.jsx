import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { useApp } from "../../context/AppContext";
import { ROLES, ROLE_META, generateDailyOutput } from "../../data/mockData";
import { Card, SectionTitle, RoleBadge, AttainmentPill, Button, formatNumber } from "../../components/ui";

export default function Goals() {
  const {
    roleDefaults,
    updateRoleDefault,
    employees,
    pendingOverrides,
    setPendingOverride,
    applyGoalChanges,
    resetOverride,
    hasPendingChanges,
  } = useApp();

  const [editingRole, setEditingRole] = useState(null);
  const [applied, setApplied] = useState(false);

  const chartData = useMemo(
    () =>
      generateDailyOutput(
        30,
        employees.reduce((sum, e) => sum + (e.override ?? roleDefaults[e.role].daily), 0)
      ),
    [roleDefaults, employees]
  );

  function handleApply() {
    applyGoalChanges();
    setApplied(true);
    setTimeout(() => setApplied(false), 1800);
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Goal Management</h1>
          <p className="text-sm text-ink-500 mt-1">
            Set daily and weekly operational targets across teams and technicians
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-semibold px-3 py-1.5">
          {formatNumber(chartData[0]?.target ?? 0)} team hrs/day target
        </span>
      </div>

      <SectionTitle title="Team Role Defaults" subtitle="Baseline daily/weekly targets applied to every technician in a role" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-w-xl">
        {Object.values(ROLES).map((role) => {
          const meta = ROLE_META[role];
          const isEditing = editingRole === role;
          return (
            <Card key={role}>
              <div className="flex items-center justify-between mb-3">
                <RoleBadge role={role} />
                <button
                  onClick={() => setEditingRole(isEditing ? null : role)}
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  {isEditing ? "Done" : "✎ Edit"}
                </button>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">
                      Daily target
                    </span>
                    <input
                      type="number"
                      value={roleDefaults[role].daily}
                      onChange={(e) => updateRoleDefault(role, "daily", Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-paper-200 px-2 py-1 text-sm font-semibold"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">
                      Weekly target
                    </span>
                    <input
                      type="number"
                      value={roleDefaults[role].weekly}
                      onChange={(e) => updateRoleDefault(role, "weekly", Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-paper-200 px-2 py-1 text-sm font-semibold"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">Daily target</p>
                  <p className="text-lg font-bold text-ink-900 -mt-0.5">
                    {roleDefaults[role].daily} {meta.unitShort}/day
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold mt-2">
                    Weekly target
                  </p>
                  <p className="text-sm font-semibold text-ink-700 -mt-0.5">
                    {roleDefaults[role].weekly} {meta.unitShort}/week
                  </p>
                </>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-4">
        <SectionTitle
          title="Individual Goal Customization"
          subtitle="Override team defaults for specific technicians based on line constraints or skill tiers"
        />
        <div className="flex items-center gap-2 -mt-6">
          {applied && (
            <span className="text-xs font-semibold text-good-600 animate-pulse">Changes applied ✓</span>
          )}
          <Button onClick={handleApply} disabled={!hasPendingChanges}>
            <CheckIcon /> Apply Changes
          </Button>
        </div>
      </div>

      <Card padded={false} className="overflow-x-auto mb-8">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Employee Name</th>
              <th className="px-4 py-3 font-semibold">Role Badge</th>
              <th className="px-4 py-3 font-semibold">Team Default Goal</th>
              <th className="px-4 py-3 font-semibold">Custom Target Override</th>
              <th className="px-4 py-3 font-semibold">Current Week Avg</th>
              <th className="px-4 py-3 font-semibold">Attainment</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => {
              const meta = ROLE_META[emp.role];
              const defaultGoal = roleDefaults[emp.role].daily;
              const pendingValue = pendingOverrides[emp.id];
              const inputValue =
                pendingValue !== undefined ? pendingValue : emp.override ?? "";
              return (
                <tr
                  key={emp.id}
                  className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}
                >
                  <td className="px-4 py-2.5 font-medium text-ink-900">{emp.name}</td>
                  <td className="px-4 py-2.5">
                    <RoleBadge role={emp.role} />
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {defaultGoal} {meta.unitShort}/day
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        placeholder="Use default…"
                        value={inputValue}
                        onChange={(e) => setPendingOverride(emp.id, e.target.value)}
                        className={`w-28 rounded-md border px-2 py-1 text-sm ${
                          pendingValue !== undefined
                            ? "border-brand-400 ring-1 ring-brand-200"
                            : emp.override != null
                            ? "border-paper-200 font-semibold text-ink-900"
                            : "border-paper-200 text-ink-400"
                        }`}
                      />
                      {(emp.override != null || pendingValue !== undefined) && (
                        <button
                          title="Reset to team default"
                          onClick={() => resetOverride(emp.id)}
                          className="text-ink-400 hover:text-bad-500 text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-700 font-medium">
                    {emp.currentWeekAvg} {meta.unitShort}
                  </td>
                  <td className="px-4 py-2.5">
                    <AttainmentPill pct={emp.attainmentPct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <SectionTitle
        title="Goal vs Actual Output"
        subtitle="Total daily hours logged across all stations for the last 30 operational days"
      />
      <Card>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef2f6" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#6b7a88" }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#6b7a88" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatNumber(v)}
            />
            <Tooltip
              formatter={(value) => [`${formatNumber(value)} hours`, "Output"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8ee" }}
            />
            <ReferenceLine
              y={chartData[0]?.target}
              stroke="#3d4c59"
              strokeDasharray="4 4"
              label={{
                value: `Daily Target ${formatNumber(chartData[0]?.target ?? 0)} hrs`,
                fontSize: 10,
                fill: "#3d4c59",
                position: "insideTopLeft",
              }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.aboveTarget ? "#1fa971" : "#d94848"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-good-500 inline-block" /> Above Target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-bad-500 inline-block" /> Below Target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-ink-500 inline-block" /> Target Line
          </span>
        </div>
      </Card>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
