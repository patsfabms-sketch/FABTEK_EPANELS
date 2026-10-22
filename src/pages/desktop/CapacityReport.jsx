import { useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { computeWeekdayCapacityReport, computeCapacityByHoursMix, CAPACITY_TARGET_PER_DAY } from "../../data/mockData";
import { Card, SectionTitle, StatCard, Button, formatDate } from "../../components/ui";

// Capacity Report — built to answer one concrete question from ownership:
// can the shop prove it ships CAPACITY_TARGET_PER_DAY (8) panels a day,
// Monday-Friday, for Siemens? That's a customer-facing throughput claim
// tied directly to an overtime-pay decision, so this report is deliberately
// conservative about what it counts:
//
//  - Saturday/Sunday shipments are tracked in their own totals and never
//    folded into the Mon-Fri average — the target is a weekday figure, so
//    weekend output can't be used to pad it, even though the shop has been
//    working weekends to get ahead.
//  - Rows logged via the admin "Mark as Sent" backlog tool are excluded
//    entirely (see computeWeekdayCapacityReport's own comment and the
//    methodology note below) — direct SQL investigation found that tool
//    stamps the *data-entry* date, not the panel's true ship date, which
//    would otherwise fabricate double-digit single-day spikes that never
//    happened.
//  - Today (still in progress) is shown but excluded from every average so
//    a half-finished day never drags down or inflates the numbers.
//
// This page is read-only and print-friendly (print:hidden / print: variants
// throughout, same convention as the rest of the app) so it can be handed to
// Siemens as-is.
export default function CapacityReport() {
  const { panels, workHistory, clockLog, employees } = useApp();

  const report = useMemo(() => computeWeekdayCapacityReport(panels, workHistory), [panels, workHistory]);
  const hoursMix = useMemo(
    () => computeCapacityByHoursMix(panels, workHistory, clockLog, employees),
    [panels, workHistory, clockLog, employees]
  );

  const atTarget = report.weekdayAvg !== null && report.weekdayAvg >= report.targetPerDay;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Capacity Report</h1>
          <p className="text-sm text-ink-500 mt-1">
            Weekday (Mon–Fri) panel throughput vs. the {CAPACITY_TARGET_PER_DAY}/day target — weekend shipments kept
            separate
          </p>
        </div>
        <Button variant="ghost" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      {/* Print-only header — the on-screen header above is hidden when printing */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold text-ink-900">FabTek Industries — Wiring Department Capacity Report</h1>
        <p className="text-sm text-ink-500 mt-1">
          Weekday (Mon–Fri) panel throughput vs. the {CAPACITY_TARGET_PER_DAY} panels/day target
        </p>
        <p className="text-[11px] text-ink-400 mt-1">Generated {new Date().toLocaleString("en-US")}</p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard
          label="Weekday Avg (Mon–Fri)"
          value={report.weekdayAvg !== null ? report.weekdayAvg : "—"}
          sub={`target ${report.targetPerDay}/day · ${report.weekdayDays} weekdays logged`}
          accent={atTarget ? "text-good-600" : "text-ink-900"}
        />
        <StatCard
          label="Best Single Weekday"
          value={report.bestWeekday}
          sub={report.bestWeekday >= report.targetPerDay ? "hit the target" : `${report.targetPerDay - report.bestWeekday} short of target`}
          accent={report.bestWeekday >= report.targetPerDay ? "text-good-600" : "text-ink-900"}
        />
        <StatCard
          label="Weekdays At/Above Target"
          value={report.pctDaysAtTarget !== null ? `${report.pctDaysAtTarget}%` : "—"}
          sub={`${report.daysAtOrAboveTarget} of ${report.weekdayDays} weekdays`}
        />
        <StatCard
          label="Weekend Panels Shipped"
          value={report.weekendTotal}
          sub={`Sat ${report.saturdayTotal} · Sun ${report.sundayTotal} — not counted toward the average above`}
        />
      </div>

      <SectionTitle
        title="Output vs. Overtime"
        subtitle={`Internal planning number, not the Siemens figure above — a "day" is 1/5 of the 40-hr week (weekday doesn't matter), the week resets every Wednesday 12am, and panels are measured by connections since every panel is a different size`}
      />
      <div className="flex flex-wrap gap-4 mb-3">
        <StatCard
          label="Avg Panels/Day at 40 Hrs"
          value={hoursMix.avgPanelsPerDayAt40 !== null ? hoursMix.avgPanelsPerDayAt40 : "—"}
          sub={
            hoursMix.goal
              ? `goal is ${hoursMix.goal.targetPanelsPerDay}/day · at the avg panel size (${hoursMix.avgConnectionsPerPanel} connections)`
              : "no complete week with shipped panels yet"
          }
          accent={
            hoursMix.goal && hoursMix.avgPanelsPerDayAt40 >= hoursMix.goal.targetPanelsPerDay ? "text-good-600" : "text-ink-900"
          }
        />
        <StatCard
          label="Avg Panels/Day with OT"
          value={hoursMix.avgPanelsPerDayWithOt !== null ? hoursMix.avgPanelsPerDayWithOt : "—"}
          sub="actual output including overtime hours worked"
          accent="text-good-600"
        />
        <StatCard
          label="What OT Is Adding"
          value={hoursMix.otContributionPerDay !== null ? `+${hoursMix.otContributionPerDay}/day` : "—"}
          sub={`from ${hoursMix.totalOvertimeHours} total OT hrs across ${hoursMix.weeksIncluded} complete week${hoursMix.weeksIncluded === 1 ? "" : "s"}`}
        />
      </div>

      {hoursMix.goal && (
        <Card className="mb-3">
          <p className="text-[13px] font-semibold text-ink-900 mb-1">
            What it takes to hit {hoursMix.goal.targetPanelsPerDay} panels/day on 40 hours
          </p>
          <p className="text-[12px] text-ink-500 mb-3">
            At the average panel size of {hoursMix.avgConnectionsPerPanel} connections, over {hoursMix.weeksIncluded}{" "}
            complete week{hoursMix.weeksIncluded === 1 ? "" : "s"} with shipped panels.
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-3 text-[13px]">
            <div>
              <p className="text-[11px] text-ink-500">Connections shipped per day</p>
              <p className="text-ink-900">
                <span className="font-semibold">{hoursMix.goal.connectionsPerDayActualAt40.toLocaleString()}</span> now at 40 hrs ·{" "}
                <span className="font-semibold">{hoursMix.goal.connectionsPerDayNeeded.toLocaleString()}</span> needed
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-500">Crew hours per panel</p>
              <p className="text-ink-900">
                <span className="font-semibold">{hoursMix.goal.actualHoursPerPanel}</span> hrs now ·{" "}
                <span className="font-semibold">{hoursMix.goal.goalHoursPerPanel}</span> hrs allowed
                <span className="text-ink-400"> ({hoursMix.goal.crewHoursPerDay} crew-hrs/day ÷ {hoursMix.goal.targetPanelsPerDay})</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-ink-500">Crew hours per 100 connections</p>
              <p className="text-ink-900">
                <span className="font-semibold">{hoursMix.goal.actualHoursPer100Connections}</span> hrs now ·{" "}
                <span className="font-semibold">{hoursMix.goal.goalHoursPer100Connections}</span> hrs allowed
              </p>
            </div>
          </div>
        </Card>
      )}

      {hoursMix.goal && hoursMix.goal.staffingScenarios.length > 0 && (
        <Card className="mb-3">
          <p className="text-[13px] font-semibold text-ink-900 mb-1">
            People needed to hit {hoursMix.goal.targetPanelsPerDay} panels/day
          </p>
          <p className="text-[12px] text-ink-500 mb-3">
            Today's crew is {hoursMix.goal.currentHeadcount} people (who clocked time last complete week). Each row asks
            "if the crew kept producing per person the way it did in that stretch, how many people would{" "}
            {hoursMix.goal.targetPanelsPerDay}/day take?"
          </p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="py-2 pr-4 font-semibold">Based on</th>
                <th className="py-2 pr-4 font-semibold">Panels/Day at 40 Hrs</th>
                <th className="py-2 pr-4 font-semibold">People Then</th>
                <th className="py-2 pr-4 font-semibold">Per Person/Day</th>
                <th className="py-2 pr-4 font-semibold">People Needed</th>
                <th className="py-2 font-semibold">Add</th>
              </tr>
            </thead>
            <tbody>
              {hoursMix.goal.staffingScenarios.map((sc) => (
                <tr key={sc.key} className="border-b border-paper-100 last:border-0">
                  <td className="py-2 pr-4 font-medium text-ink-900">
                    {sc.label}
                    <span className="text-[11px] text-ink-400"> ({sc.weeks} wk{sc.weeks === 1 ? "" : "s"})</span>
                  </td>
                  <td className="py-2 pr-4 text-ink-700">{sc.panelsPerDayAt40}</td>
                  <td className="py-2 pr-4 text-ink-700">{sc.headcount}</td>
                  <td className="py-2 pr-4 text-ink-700">{sc.perPersonPerDay}</td>
                  <td className="py-2 pr-4 text-ink-700">{sc.peopleNeeded}</td>
                  <td className="py-2 font-semibold text-ink-900">{sc.addPeople !== null ? `+${sc.addPeople}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-ink-400 mt-3">
            A planning estimate: it assumes a new hire eventually produces like the current crew. It ignores ramp-up and
            training time, and any step that can't scale with headcount (Packout Verifying, QC/Wrap, floor space).
          </p>
        </Card>
      )}

      <Card padded={false} className="overflow-x-auto mb-3">
        {hoursMix.weeks.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No complete payroll week with clocked hours yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Payroll Week Of</th>
                <th className="px-4 py-3 font-semibold">Shipped</th>
                <th className="px-4 py-3 font-semibold">Connections</th>
                <th className="px-4 py-3 font-semibold">Avg Conns/Panel</th>
                <th className="px-4 py-3 font-semibold">Panels/Day</th>
                <th className="px-4 py-3 font-semibold">Regular Hrs</th>
                <th className="px-4 py-3 font-semibold">OT Hrs</th>
                <th className="px-4 py-3 font-semibold">Panels at 40 Hrs</th>
                <th className="px-4 py-3 font-semibold">Panels from OT</th>
              </tr>
            </thead>
            <tbody>
              {hoursMix.weeks.map((w, i) => (
                <tr key={w.weekOf} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""} ${w.inProgress || w.noShipData ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-ink-900">
                    {formatDate(w.weekOf)}
                    {w.inProgress && <span className="ml-2 text-[10px] text-ink-400 uppercase tracking-wide">In progress</span>}
                    {w.noShipData && <span className="ml-2 text-[10px] text-ink-400 uppercase tracking-wide">No ships logged — not counted</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">{w.shipped}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.connections.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.avgConnectionsPerPanel ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.panelsPerDay ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.regularHours}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.overtimeHours}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.regularAttributedPanels}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.overtimeAttributedPanels}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-[11px] text-ink-400 mt-3 mb-8">
        Panels aren't all the same size, so the daily figures above are built from connections shipped (each panel's
        estimate price ÷ its own $/connection), then converted back to panels at the average panel size so they line up
        with the {hoursMix.goal?.targetPanelsPerDay ?? 8}-a-day goal. A "day" is one-fifth of the 40-hr week (8 crew-hours),
        regardless of which weekdays or weekend days were worked, and the week resets every Wednesday at 12am. There's
        no way to know which specific clocked hour built which specific panel, so each week's output is split across that
        week's regular vs. overtime hours in direct proportion to how many of each were worked — an approximation, not
        a claim that an overtime hour is exactly as productive as a regular one. Weeks with no shipped panels on record,
        and the in-progress current week, are shown but left out of the averages.
      </p>

      <SectionTitle
        title="Week-by-Week Trend"
        subtitle="Mon–Fri totals only, grouped by the Monday of each week"
      />
      <Card padded={false} className="overflow-x-auto mb-8">
        {report.weeks.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">No completed weekday data yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Week Of</th>
                <th className="px-4 py-3 font-semibold">Weekdays Logged</th>
                <th className="px-4 py-3 font-semibold">Panels Shipped (Mon–Fri)</th>
                <th className="px-4 py-3 font-semibold">Avg/Day</th>
              </tr>
            </thead>
            <tbody>
              {report.weeks.map((w, i) => (
                <tr key={w.weekOf} className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-ink-900">{formatDate(w.weekOf)}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.weekdaysLogged}</td>
                  <td className="px-4 py-2.5 text-ink-700">{w.total}</td>
                  <td className={`px-4 py-2.5 font-semibold ${w.avgPerDay >= report.targetPerDay ? "text-good-600" : "text-ink-900"}`}>
                    {w.avgPerDay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <SectionTitle title="Daily Detail" subtitle="Every day with logged activity — weekday and weekend shown together, in order" />
      <Card padded={false} className="overflow-x-auto mb-3">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Day</th>
              <th className="px-4 py-3 font-semibold">Panels Shipped</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((d, i) => (
              <tr
                key={d.date}
                className={`border-b border-paper-100 last:border-0 ${i % 2 === 1 ? "bg-paper-50/60" : ""} ${
                  !d.isWeekday ? "bg-paper-50/40" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-ink-900">{formatDate(d.date)}</td>
                <td className="px-4 py-2.5 text-ink-600">{d.dow}</td>
                <td className="px-4 py-2.5 font-semibold">
                  {d.inProgress ? (
                    <span className="text-ink-400">{d.panelsShipped} so far</span>
                  ) : (
                    <span className={d.panelsShipped >= report.targetPerDay ? "text-good-600" : "text-ink-900"}>
                      {d.panelsShipped}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[11px] text-ink-500">
                  {d.inProgress
                    ? "In progress — excluded from averages"
                    : d.isWeekday
                    ? d.panelsShipped >= report.targetPerDay
                      ? "Weekday — hit target"
                      : "Weekday"
                    : "Weekend — not counted toward Mon–Fri average"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-ink-400 mt-3 mb-8">
        A day only appears here if the shop logged real production activity on it — a day with no activity at all
        (a plant closure or holiday) is left out rather than counted as a 0-panel weekday, so it doesn't unfairly
        drag the average down.
      </p>

      <SectionTitle title="Methodology" />
      <Card className="text-[12px] text-ink-600 leading-relaxed space-y-2">
        <p>
          <strong className="text-ink-900">"Shipped"</strong> means a completed Wrap session — this app's existing
          definition of a finished, billable panel, same one used everywhere else in AssemblyOS (Payroll,
          Analytics). A panel counts on the calendar day its Wrap session finished.
        </p>
        <p>
          <strong className="text-ink-900">Admin backlog corrections are excluded.</strong> This shop has an admin
          tool ("Mark as Sent") for clearing a backlog of panels that shipped before they were logged in the app.
          That tool records the date an admin entered the correction, not the panel's true historical ship date — so
          including those rows would make some days look far busier than they actually were. Every figure on this
          report — daily counts, weekly trends, the weekday average — excludes those rows entirely
          {report.excludedAdminCorrections > 0
            ? ` (${report.excludedAdminCorrections} admin-logged row${report.excludedAdminCorrections === 1 ? "" : "s"} excluded from this report's totals).`
            : "."}
        </p>
        <p>
          <strong className="text-ink-900">Weekend shipments are never counted toward the Mon–Fri average.</strong>{" "}
          Saturday and Sunday totals are shown for reference only, in their own line items — they cannot and do not
          inflate the weekday figure above, since the target this report measures against is specifically a
          Monday–Friday one.
        </p>
        <p>
          <strong className="text-ink-900">Today is shown but not counted.</strong> The current calendar day is
          still in progress, so it's excluded from every average and total on this report until it's complete.
        </p>
      </Card>
    </div>
  );
}
