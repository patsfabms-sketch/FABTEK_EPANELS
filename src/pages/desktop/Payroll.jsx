import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  computePayrollSummary,
  computeWeeklyProfitAndLoss,
  payrollWeekStart,
  payrollWeekRange,
  OVERTIME_THRESHOLD_HOURS,
  OVERTIME_MULTIPLIER,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, RoleBadge, Avatar, Button, formatCurrency } from "../../components/ui";

// Payroll — the shop's payroll week runs Wednesday through Tuesday (see
// payrollWeekStart/payrollWeekRange in mockData.js), and every clocked hour
// past 40 in that week pays out at 1.5x. This page is read-only: it doesn't
// change anyone's pay rate or write anything back — it's a report an admin
// reads off to actually run payroll, computed live from the same
// assemblyos_clock_log data the Clock QR already collects (see the "why
// clocked hours, not task hours" comment on computeOvertimePay in
// mockData.js).
export default function Payroll() {
  const { employees, clockLog, panels, workHistory } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Which payroll week is being viewed — defaults to the current one,
  // steps a whole week at a time via the arrows below. Stored as a
  // reference Date rather than a weekKey string so "previous/next week" is
  // just ±7 days, no string parsing back and forth.
  const [refDate, setRefDate] = useState(() => new Date());

  const { start, end } = useMemo(() => payrollWeekRange(refDate), [refDate]);
  const weekStartLabel = useMemo(
    () => payrollWeekStart(refDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    [refDate]
  );
  const weekEndLabel = useMemo(
    () => new Date(end - 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    [end]
  );
  const isCurrentWeek = payrollWeekStart(refDate).getTime() === payrollWeekStart(new Date(now)).getTime();

  const rows = useMemo(
    () => computePayrollSummary(clockLog, employees, start, end, { now }),
    [clockLog, employees, start, end, now]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          totalHours: acc.totalHours + r.totalHours,
          overtimeHours: acc.overtimeHours + r.overtimeHours,
          totalPay: acc.totalPay + r.totalPay,
          overtimePay: acc.overtimePay + r.overtimePay,
          inOvertime: acc.inOvertime + (r.overtimeHours > 0 ? 1 : 0),
        }),
        { totalHours: 0, overtimeHours: 0, totalPay: 0, overtimePay: 0, inOvertime: 0 }
      ),
    [rows]
  );

  // Profit & loss for this same week — revenue from panels that shipped
  // during it against this week's real payroll cost (totals.totalPay
  // above). See computeWeeklyProfitAndLoss's own comment for exactly what
  // "work logged complete" is read to mean here.
  const pnl = useMemo(
    () => computeWeeklyProfitAndLoss(panels, workHistory, clockLog, employees, start, end, { now }),
    [panels, workHistory, clockLog, employees, start, end, now]
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Payroll</h1>
          <p className="text-sm text-ink-500 mt-1">
            Regular and overtime hours/pay by payroll week — every clocked hour past {OVERTIME_THRESHOLD_HOURS} pays
            at {OVERTIME_MULTIPLIER}x
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setRefDate((d) => new Date(d.getTime() - 7 * 86400000))}>
            ← Prev Week
          </Button>
          <div className="text-[13px] font-semibold text-ink-900 px-2">
            Week of {weekStartLabel} – {weekEndLabel}
            {isCurrentWeek && <span className="ml-1.5 text-[10px] font-semibold text-brand-600">(current)</span>}
          </div>
          <Button
            variant="ghost"
            onClick={() => setRefDate((d) => new Date(d.getTime() + 7 * 86400000))}
            disabled={isCurrentWeek}
          >
            Next Week →
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Total Payroll" value={formatCurrency(totals.totalPay)} sub={`${Number(totals.totalHours.toFixed(1))} hrs total`} />
        <StatCard
          label="Overtime Pay"
          value={formatCurrency(totals.overtimePay)}
          sub={`${Number(totals.overtimeHours.toFixed(1))} OT hrs`}
          accent={totals.overtimeHours > 0 ? "text-warn-600" : "text-ink-900"}
        />
        <StatCard
          label="Employees in Overtime"
          value={totals.inOvertime}
          sub={`of ${rows.length} on the roster`}
          accent={totals.inOvertime > 0 ? "text-warn-600" : "text-ink-900"}
        />
      </div>

      <SectionTitle
        title="By Employee"
        subtitle="Clocked (attendance) hours for the week shown — from the shared Clock QR, not task/session hours"
      />
      <Card padded={false} className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No employees on the roster yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Pay Rate</th>
                <th className="px-4 py-3 font-semibold">Total Hrs</th>
                <th className="px-4 py-3 font-semibold">Regular Hrs</th>
                <th className="px-4 py-3 font-semibold">OT Hrs</th>
                <th className="px-4 py-3 font-semibold">Regular Pay</th>
                <th className="px-4 py-3 font-semibold">OT Pay</th>
                <th className="px-4 py-3 font-semibold">Total Pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.employee.id}
                  className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""} ${
                    r.overtimeHours > 0 ? "bg-warn-50/40" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-ink-900 flex items-center gap-2.5">
                    <Avatar employee={r.employee} />
                    {r.employee.name}
                  </td>
                  <td className="px-4 py-2.5"><RoleBadge role={r.employee.role} /></td>
                  <td className="px-4 py-2.5 text-ink-600">${r.employee.payRate?.toFixed(2)}/hr</td>
                  <td className="px-4 py-2.5 text-ink-700 font-medium">{r.totalHours}</td>
                  <td className="px-4 py-2.5 text-ink-700">{r.regularHours}</td>
                  <td className="px-4 py-2.5">
                    {r.overtimeHours > 0 ? (
                      <span className="font-semibold text-warn-600">{r.overtimeHours}</span>
                    ) : (
                      <span className="text-ink-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{formatCurrency(r.regularPay)}</td>
                  <td className="px-4 py-2.5 text-ink-700">{r.overtimePay > 0 ? formatCurrency(r.overtimePay) : "—"}</td>
                  <td className="px-4 py-2.5 text-ink-900 font-semibold">{formatCurrency(r.totalPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-[11px] text-ink-400 mt-3 mb-8">
        Based on clocked (attendance) time from the shared Clock QR — includes paid break time already inside a
        clock-in/out span, same as attendance is tracked everywhere else in this app. An employee still clocked in
        right now has their open entry capped at the current time, not projected forward. This is a payroll report
        only; it doesn't change the pay rate used elsewhere (panel cost estimates, the Analytics blended labor rate)
        since those are about what a panel costs to build, not what payroll actually owes for the week.
      </p>

      <SectionTitle
        title="Profit & Loss — This Week"
        subtitle="Revenue from panels that shipped this week vs. this week's real payroll cost (above)"
      />
      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard
          label="Revenue Shipped"
          value={formatCurrency(pnl.revenue)}
          sub={`${pnl.shippedPanels.length} panel${pnl.shippedPanels.length === 1 ? "" : "s"} shipped`}
        />
        <StatCard label="Payroll Cost" value={formatCurrency(pnl.payrollCost)} sub="Same total as above" />
        <StatCard
          label="Profit"
          value={formatCurrency(pnl.profit)}
          sub={pnl.marginPct !== null ? `${pnl.marginPct}% margin` : "No revenue shipped this week"}
          accent={pnl.profit > 0 ? "text-good-600" : pnl.profit < 0 ? "text-bad-600" : "text-ink-900"}
        />
      </div>

      <Card padded={false} className="overflow-x-auto">
        {pnl.shippedPanels.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">
            No panels shipped (completed Wrap) during this week — payroll cost this week isn't backed by any revenue
            recognized in the same week, which can be normal (work in progress on panels that'll ship later) or
            worth a look if it keeps happening.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Panel</th>
                <th className="px-4 py-3 font-semibold">Job #</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {pnl.shippedPanels.map((p, i) => (
                <tr key={p.buildId} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-4 py-2.5 text-ink-900 font-medium">#{p.id}</td>
                  <td className="px-4 py-2.5 text-ink-600">{p.jobNumber || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-600">{p.customer || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-700 font-medium">{formatCurrency(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-[11px] text-ink-400 mt-3">
        "Shipped" means a completed Wrap session logged during this week — this app's existing definition of a
        finished, billable panel (same one the Analytics build-time projections use). Revenue is each shipped
        panel's estimate price; it isn't split across the weeks it was actually worked, so a panel worked over
        several weeks shows all its revenue in the one week it shipped. This is labor cost only, same as the payroll
        numbers above — materials, overhead, and any other cost aren't factored in, so "Profit" here means labor
        margin, not true net profit.
      </p>
    </div>
  );
}
