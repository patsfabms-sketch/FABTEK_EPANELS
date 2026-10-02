import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import { useApp } from "../../context/AppContext";
import {
  computeWeeklyProfitAndLoss,
  computeMarginDrivers,
  computeMarginDriversTrend,
  computeProfitAndLossTrend,
  computeLiveProfitMargin,
  computeLiveProfitMarginHistory,
  MARGIN_TRACKING_START_DATE,
  payrollWeekStart,
  payrollWeekRange,
} from "../../data/mockData";
import { Card, SectionTitle, StatCard, Button, formatCurrency, formatNumber, formatDate } from "../../components/ui";

// Fixed categorical hue per metric, in the same order the cards render —
// each metric gets its own small bar chart (a "small multiple") rather
// than one chart with six differently-scaled series on it, since Panels
// Shipped (tens), Connections Credited (thousands), and Packout Issues
// (single digits) can't honestly share one y-axis. The in-progress
// (current) week's bar is rendered at reduced opacity in every chart —
// same "still accruing, not a finished number" convention the rest of
// this page already uses (see the trend table's opacity-60 row).
const DRIVER_METRICS = [
  { key: "shippedCount", label: "Panels Shipped", sub: "Completed Wrap", color: "#2a78d6", unit: "" },
  { key: "otHours", label: "OT Hours (shop-wide)", sub: "Clocked hours over 40/wk", color: "#eb6834", unit: " hrs" },
  { key: "connectionsCredited", label: "Connections Credited", sub: "Route/Terminate", color: "#1baf7a", unit: "" },
  { key: "reworkSessions", label: "Rework Sessions", sub: "Logged at the Rework stage", color: "#eda100", unit: "", hoursKey: "reworkHours" },
  { key: "flaggedSessions", label: "Flagged Sessions", sub: "Needs a manager's review", color: "#e87ba4", unit: "" },
  { key: "packoutIssuesReported", label: "Packout Issues Reported", sub: "Missing parts at kit verification", color: "#008300", unit: "" },
];

function shortWeekLabel(weekOf) {
  const d = new Date(`${weekOf}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekOf;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function MetricBarChart({ metric, data }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[13px] font-semibold text-ink-900">{metric.label}</p>
        <p className="text-[11px] text-ink-400">{metric.sub}</p>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f6" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#6b7a88" }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v) => formatNumber(v)} />
          <Tooltip
            cursor={{ fill: "#f5f7fa" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8ee" }}
            formatter={(value, _name, item) => {
              const hrs = metric.hoursKey ? item.payload[metric.hoursKey] : null;
              return [`${formatNumber(value)}${metric.unit}${hrs != null ? ` (${hrs} hrs)` : ""}`, metric.label];
            }}
            labelFormatter={(label, items) => {
              const wk = items?.[0]?.payload;
              return `Week of ${label}${wk?.inProgress ? " (in progress)" : ""}`;
            }}
          />
          <Bar dataKey={metric.key} radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((w) => (
              <Cell key={w.weekOf} fill={metric.color} fillOpacity={w.inProgress ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

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

function shortDayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

// The "ticker" chart Pat asked for: "i think it would look cool to also
// have a live chart like a stock on the nyse. something like a robinhood
// setup." One series (the same cumulative margin the hero number shows),
// so no legend box is needed — the card's own title already says what's
// plotted. Colored green/red by whether the line is net up or down over
// the whole visible stretch (the same read as a stock chart's day color),
// not per-point, so the color stays one consistent signal rather than
// flickering per day. A dashed 0% reference line is included since margin
// (unlike a share price) can actually go negative, and today's point gets
// its own end-marker so the current, still-moving value is visually
// distinct from the settled history behind it.
function LiveMarginChart({ data }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-[140px] text-[12px] text-ink-400">
        Not enough days tracked yet to chart a trend — check back after a few more days.
      </div>
    );
  }
  const first = data[0].marginPct ?? 0;
  const last = data[data.length - 1].marginPct ?? 0;
  const isUp = last >= first;
  const color = isUp ? "#1fa971" : "#d94848"; // good-500 / bad-500 — same tokens the rest of this page uses for margin sign
  const gradientId = isUp ? "fillMarginUp" : "fillMarginDown";

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.28} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eef2f6" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDayLabel}
          tick={{ fontSize: 10, fill: "#6b7a88" }}
          axisLine={false}
          tickLine={false}
          interval={Math.max(0, Math.ceil(data.length / 7) - 1)}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#6b7a88" }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v}%`}
        />
        <ReferenceLine y={0} stroke="#c9d3dc" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ stroke: "#c9d3dc", strokeWidth: 1 }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8ee" }}
          formatter={(value) => [value === null ? "no revenue yet" : `${value}%`, "Overall margin"]}
          labelFormatter={(label, items) => {
            const pt = items?.[0]?.payload;
            return `${shortDayLabel(label)}${pt?.isToday ? " (today, still moving)" : ""}`;
          }}
        />
        <Area
          type="monotone"
          dataKey="marginPct"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
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

  // Live, cumulative margin for the hero stat at the top of the page — Pat:
  // "i need to have a live profit margin percentage at the top of the page.
  // that goes up and down." This is deliberately NOT tied to the Prev/Next
  // Week selector above (it always reflects real time, "now", regardless of
  // which single week is being browsed below) and deliberately excludes the
  // ramp-up period before the site was fully up and running (see
  // MARGIN_TRACKING_START_DATE's own comment). `liveMarginBeforeThisWeek`
  // recomputes the same cumulative figure as of right before the current
  // payroll week started, purely so the hero stat can show whether this
  // week's activity is pulling the overall number up or down, not as a
  // separate metric of its own.
  const liveMargin = useMemo(
    () => computeLiveProfitMargin(panels, workHistory, clockLog, employees, { now }),
    [panels, workHistory, clockLog, employees, now]
  );
  const liveMarginBeforeThisWeek = useMemo(
    () => computeLiveProfitMargin(panels, workHistory, clockLog, employees, { now: payrollWeekStart(new Date(now)).getTime() - 1 }),
    [panels, workHistory, clockLog, employees, now]
  );
  const liveMarginDelta =
    liveMargin.marginPct !== null && liveMarginBeforeThisWeek.marginPct !== null
      ? liveMargin.marginPct - liveMarginBeforeThisWeek.marginPct
      : null;
  const trackingStartLabel = new Date(`${MARGIN_TRACKING_START_DATE}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Day-by-day series behind the "stock ticker" chart in the hero card —
  // see computeLiveProfitMarginHistory's own comment for why this has to
  // stay week-scoped internally even though it returns one point per day.
  const marginHistory = useMemo(
    () => computeLiveProfitMarginHistory(panels, workHistory, clockLog, employees, { now }),
    [panels, workHistory, clockLog, employees, now]
  );

  // Last 12 payroll weeks' driver metrics, for the "What's Changing Margin"
  // bar charts below — a superset of `trend` (adds OT/connections/rework/
  // flagged/packout on top of revenue/cost/profit) since the chart is a
  // separate comparison tool from the week-by-week $ table further down.
  const driversTrend = useMemo(
    () => computeMarginDriversTrend(panels, workHistory, clockLog, employees, { weeks: 12, now }),
    [panels, workHistory, clockLog, employees, now]
  );

  // null = "no explicit choice yet" -> defaults to the 4 most recent weeks
  // (current + 3 prior), so the charts show a meaningful comparison the
  // moment the page loads rather than starting empty. Once the admin picks
  // weeks explicitly, that selection sticks (independent of the Prev/Next
  // Week arrows above, which only move the single-week snapshot/table).
  const [selectedWeeks, setSelectedWeeks] = useState(null);
  const MAX_COMPARE_WEEKS = 6;
  const effectiveSelectedWeeks = useMemo(
    () => selectedWeeks ?? driversTrend.slice(0, 4).map((w) => w.weekOf),
    [selectedWeeks, driversTrend]
  );
  const chartData = useMemo(
    () =>
      driversTrend
        .filter((w) => effectiveSelectedWeeks.includes(w.weekOf))
        .sort((a, b) => a.weekStart - b.weekStart)
        .map((w) => ({ ...w, label: shortWeekLabel(w.weekOf) })),
    [driversTrend, effectiveSelectedWeeks]
  );
  const toggleCompareWeek = (weekOf) => {
    setSelectedWeeks((prev) => {
      const base = prev ?? driversTrend.slice(0, 4).map((w) => w.weekOf);
      if (base.includes(weekOf)) {
        if (base.length <= 1) return base; // always keep at least one week charted
        return base.filter((w) => w !== weekOf);
      }
      if (base.length >= MAX_COMPARE_WEEKS) return base;
      return [...base, weekOf];
    });
  };

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

      <Card className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-good-500 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-good-500" />
              </span>
              <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">Live Overall Profit Margin</p>
            </div>
            <p className="text-[11px] text-ink-400 mt-1">
              Real revenue vs. real payroll cost, every payroll week since {trackingStartLabel} ({liveMargin.weeksCounted} week
              {liveMargin.weeksCounted === 1 ? "" : "s"} counted, this week included) — everything before that is left out
              since the site wasn't fully up and running yet.
            </p>
          </div>
          <div className="text-right">
            <p
              className={`text-4xl font-bold leading-none ${
                liveMargin.marginPct === null ? "text-ink-400" : liveMargin.marginPct >= 0 ? "text-good-600" : "text-bad-600"
              }`}
            >
              {liveMargin.marginPct !== null ? `${liveMargin.marginPct}%` : "—"}
            </p>
            <p className="text-[11px] mt-1">
              {liveMarginDelta === null ? (
                <span className="text-ink-400">no prior data</span>
              ) : liveMarginDelta === 0 ? (
                <span className="text-ink-400">unchanged this week</span>
              ) : (
                <span className={`font-semibold ${liveMarginDelta > 0 ? "text-good-600" : "text-bad-600"}`}>
                  {liveMarginDelta > 0 ? "▲" : "▼"} {Math.abs(liveMarginDelta)} pt{Math.abs(liveMarginDelta) === 1 ? "" : "s"} this
                  week
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="mt-3 -mx-1">
          <LiveMarginChart data={marginHistory} />
        </div>
        <p className="text-[11px] text-ink-400 mt-1">
          Every tracked day since {trackingStartLabel}, cumulative — not one day's own margin in isolation. Today's
          point is still moving as more work gets logged.
        </p>
      </Card>

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
        subtitle="Real, already-tracked shop signals, charted per week — not a claim about which one caused the swing"
      />
      <Card className="mb-3">
        <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
          Compare weeks ({effectiveSelectedWeeks.length}/{MAX_COMPARE_WEEKS})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {driversTrend.map((w) => {
            const isOn = effectiveSelectedWeeks.includes(w.weekOf);
            const atCap = !isOn && effectiveSelectedWeeks.length >= MAX_COMPARE_WEEKS;
            return (
              <button
                key={w.weekOf}
                type="button"
                onClick={() => toggleCompareWeek(w.weekOf)}
                disabled={atCap}
                title={atCap ? `Up to ${MAX_COMPARE_WEEKS} weeks at once` : undefined}
                className={`text-[12px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  isOn
                    ? "bg-brand-500/10 border-brand-500/40 text-brand-700"
                    : atCap
                    ? "border-paper-200 text-ink-300 cursor-not-allowed"
                    : "border-paper-200 text-ink-500 hover:border-paper-300 hover:text-ink-700"
                }`}
              >
                {shortWeekLabel(w.weekOf)}
                {w.inProgress && <span className="text-ink-400"> (in progress)</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-3">
        {DRIVER_METRICS.map((metric) => (
          <MetricBarChart key={metric.key} metric={metric} data={chartData} />
        ))}
      </div>
      <p className="text-[11px] text-ink-400 mt-1 mb-8">
        These are the shop signals most likely to explain a margin swing, charted for whichever weeks are checked
        above — side by side so you can judge for yourself what's actually behind it, not asserted as the cause. A
        faded bar is the current, still-in-progress week — its numbers will keep moving until the week closes.
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
