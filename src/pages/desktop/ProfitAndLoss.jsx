import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  computeWeeklyProfitAndLoss,
  computeMarginDrivers,
  computeProfitAndLossTrend,
  payrollWeekStart,
  payrollWeekRange,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, Button, formatCurrency, formatDate } from "../../components/ui";

// Profit & Loss — its own page (split out of Payroll at Pat's request) so
// it's easy to come back to and compare week over week, rather than being
// buried under the payroll table on a different page. Everything here is
// the same weekly revenue-vs-labor-cost figure Payroll.jsx already showed
// (see computeWeeklyProfitAndLoss's own comment for exactly what "shipped"
// and "revenue" mean, and why admin backlog corrections are excluded from
// which week they land in) — this page adds the comparison Pat asked for on
// top of it, not a different number.
function DeltaLine({ value, suffix = "", goodDirection = "up", formatter = (n) => n }) {
  if (value === null || value === undefined) return <span className="text-ink-400">no prior data</span>;
  if (value === 0) return <span className="text-ink-400">no change vs last week</span>;
  const isUp = value > 0;
  const isGood = goodDirection === "up" ? isUp : !isUp;
  const color = goodDirection === "neutral" ? "text-ink-600" : isGood ? "text-good-600" : "text-bad-600";
  return (
    <span className={`font-semibold ${color}`}>
      {isUp ? "▲" : "▼"} {formatter(Math.abs(value))}
      {suffix} vs last week
    </span>
  );
}

export default function ProfitAndLoss() {
  const { panels, workHistory, clockLog, employees } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const [refDate, setRefDate] = useState(() => new Date());
  const { start, end } = useMemo(() => payrollWeekRange(refDate), [refDate]);
  const prevRange = useMemo(() => payrollWeekRange(new Date(refDate.getTime() - 7 * 86400000)), [refDate]);
  const weekStartLabel = useMemo(
    () => payrollWeekStart(refDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    [refDate]
  );
  const weekEndLabel = useMemo(
    () => new Date(end - 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    [end]
  );
  const isCurrentWeek = payrollWeekStart(refDate).getTime() === payrollWeekStart(new Date(now)).getTime();

  const pnl = useMemo(
    () => computeWeeklyProfitAndLoss(panels, workHistory, clockLog, employees, start, end, { now }),
    [panels, workHistory, clockLog, employees, start, end, now]
  );

  const drivers = useMemo(
    () => computeMarginDrivers(panels, workHistory, clockLog, employees, { start, end }, prevRange, { now }),
    [panels, workHistory, clockLog, employees, start, end, prevRange, now]
  );

  const trend = useMemo(
    () => computeProfitAndLossTrend(panels, workHistory, clockLog, employees, { weeks: 10, now }),
    [panels, workHistory, clockLog, employees, now]
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Profit & Loss</h1>
          <p className="text-sm text-ink-500 mt-1">
            Revenue from panels shipped this payroll week vs. that week's real payroll cost
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

      <div className="flex flex-wrap gap-4 mb-2">
        <StatCard
          label="Revenue Shipped"
          value={formatCurrency(pnl.revenue)}
          sub={`${pnl.shippedPanels.length} panel${pnl.shippedPanels.length === 1 ? "" : "s"} shipped`}
        />
        <StatCard label="Payroll Cost" value={formatCurrency(pnl.payrollCost)} sub="Clocked hours, OT included" />
        <StatCard
          label="Profit"
          value={formatCurrency(pnl.profit)}
          sub={pnl.marginPct !== null ? `${pnl.marginPct}% margin` : "No revenue shipped this week"}
          accent={pnl.profit > 0 ? "text-good-600" : pnl.profit < 0 ? "text-bad-600" : "text-ink-900"}
        />
      </div>
      <div className="flex flex-wrap gap-4 mb-6 text-[12px]">
        <div className="min-w-[200px]"><DeltaLine value={drivers.deltas.revenue} formatter={formatCurrency} goodDirection="up" /></div>
        <div className="min-w-[200px]"><DeltaLine value={drivers.deltas.payrollCost} formatter={formatCurrency} goodDirection="down" /></div>
        <div className="min-w-[200px]"><DeltaLine value={drivers.deltas.profit} formatter={formatCurrency} goodDirection="up" /></div>
      </div>

      <SectionTitle
        title="What's Changing Margin"
        subtitle="Real, already-tracked shop signals compared to last week — not a claim about which one caused the swing"
      />
      <Card className="mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
          <div className="flex items-center justify-between border-b border-paper-100 pb-2">
            <span className="text-ink-600">OT hours (shop-wide)</span>
            <span className="text-right">
              <span className="font-semibold text-ink-900">{drivers.current.otHours}</span>
              <span className="text-ink-400"> vs {drivers.previous.otHours}</span>{" "}
              <DeltaLine value={drivers.deltas.otHours} suffix=" hrs" goodDirection="down" />
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-paper-100 pb-2">
            <span className="text-ink-600">Connections credited</span>
            <span className="text-right">
              <span className="font-semibold text-ink-900">{drivers.current.connectionsCredited}</span>
              <span className="text-ink-400"> vs {drivers.previous.connectionsCredited}</span>{" "}
              <DeltaLine value={drivers.deltas.connectionsCredited} goodDirection="up" />
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-paper-100 pb-2">
            <span className="text-ink-600">Rework sessions ({drivers.current.reworkHours} hrs)</span>
            <span className="text-right">
              <span className="font-semibold text-ink-900">{drivers.current.reworkSessions}</span>
              <span className="text-ink-400"> vs {drivers.previous.reworkSessions}</span>{" "}
              <DeltaLine value={drivers.deltas.reworkSessions} goodDirection="down" />
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-paper-100 pb-2 sm:border-b-0">
            <span className="text-ink-600">Flagged sessions</span>
            <span className="text-right">
              <span className="font-semibold text-ink-900">{drivers.current.flaggedSessions}</span>
              <span className="text-ink-400"> vs {drivers.previous.flaggedSessions}</span>{" "}
              <DeltaLine value={drivers.deltas.flaggedSessions} goodDirection="down" />
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 sm:pt-0">
            <span className="text-ink-600">Packout issues reported</span>
            <span className="text-right">
              <span className="font-semibold text-ink-900">{drivers.current.packoutIssuesReported}</span>
              <span className="text-ink-400"> vs {drivers.previous.packoutIssuesReported}</span>{" "}
              <DeltaLine value={drivers.deltas.packoutIssuesReported} goodDirection="down" />
            </span>
          </div>
        </div>
      </Card>
      <p className="text-[11px] text-ink-400 mt-2 mb-8">
        These are the shop signals most likely to explain a margin swing — they're shown side by side so you can
        judge for yourself what's actually behind it, not asserted as the cause. "Good direction" coloring is a
        simplification (e.g. more connections credited is shown as favorable, more rework as unfavorable) — read the
        raw numbers, not just the color, since a real explanation can cut the other way (more OT can also mean more
        got shipped).
      </p>

      <SectionTitle title="Shipped This Week" subtitle="Panels behind the revenue figure above" />
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
      <p className="text-[11px] text-ink-400 mt-3 mb-8">
        "Shipped" means a completed Wrap session logged during this week. Revenue is each shipped panel's estimate
        price; it isn't split across the weeks it was actually worked. This is labor cost only — materials, overhead,
        and any other cost aren't factored in, so "Profit" here means labor margin, not true net profit.
        {pnl.excludedAdminCorrections > 0 && (
          <>
            {" "}This week also excludes {pnl.excludedAdminCorrections} panel
            {pnl.excludedAdminCorrections === 1 ? "" : "s"} ({formatCurrency(pnl.excludedAdminRevenue)}) marked
            "Sent" via the admin backlog tool during this window — those corrections are stamped with the day they
            were entered, not the panel's real ship date, so counting them here would fabricate this week's numbers.
          </>
        )}
      </p>

      <SectionTitle title="Week-by-Week Comparison" subtitle="Last 10 payroll weeks, most recent first" />
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Week Of</th>
              <th className="px-4 py-3 font-semibold">Shipped</th>
              <th className="px-4 py-3 font-semibold">Revenue</th>
              <th className="px-4 py-3 font-semibold">Payroll Cost</th>
              <th className="px-4 py-3 font-semibold">Profit</th>
              <th className="px-4 py-3 font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((w, i) => (
              <tr key={w.weekOf} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""} ${w.inProgress ? "opacity-60" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-ink-900">
                  {formatDate(w.weekOf)}
                  {w.inProgress && <span className="ml-2 text-[10px] text-ink-400 uppercase tracking-wide">In progress</span>}
                </td>
                <td className="px-4 py-2.5 text-ink-700">{w.shippedCount}</td>
                <td className="px-4 py-2.5 text-ink-700">{formatCurrency(w.revenue)}</td>
                <td className="px-4 py-2.5 text-ink-700">{formatCurrency(w.payrollCost)}</td>
                <td className={`px-4 py-2.5 font-semibold ${w.profit > 0 ? "text-good-600" : w.profit < 0 ? "text-bad-600" : "text-ink-900"}`}>
                  {formatCurrency(w.profit)}
                </td>
                <td className="px-4 py-2.5 text-ink-700">{w.marginPct !== null ? `${w.marginPct}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
