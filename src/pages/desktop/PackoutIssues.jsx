import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { computePackoutIssues } from "../../data/mockData";
import { Card, SectionTitle, StatCard, Button, formatDateTime } from "../../components/ui";

// Packout Issues — Pat's request: Cierra (Lead Panel Technician) verifies
// every incoming kit against its parts list before a build starts, and when
// something's missing she's been noting it. Pat wants that turned into real,
// readily-available evidence that a hold-up is on Siemens' side (an
// incomplete customer-supplied kit), not the shop's.
//
// Before building this, checked the actual database rather than assuming
// Cierra's notes were captured anywhere: they weren't. The Stop Session
// screen has had a free-text "Notes" field since early in this project, but
// AppContext.stopSession never wrote it into the saved record — it was
// silently discarded every time. Nothing Cierra typed there before this
// deploy was ever saved, so this page can only show data from here forward.
// Fixed alongside this feature: Notes are now genuinely persisted (any
// stage), and the Verifying Packout stage specifically now requires a real
// Yes/No answer — "was everything there?" — before a session can be logged
// out, with a required description whenever the answer is no. That
// structured answer, not free-text notes, is what this page tracks.
export default function PackoutIssues() {
  const { panels, workHistory, employees } = useApp();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const issues = useMemo(
    () => computePackoutIssues(panels, workHistory, employees, { now }),
    [panels, workHistory, employees, now]
  );

  const openIssues = useMemo(() => issues.filter((i) => !i.resolved), [issues]);
  const resolvedIssues = useMemo(() => issues.filter((i) => i.resolved), [issues]);
  const avgDaysToResolve = useMemo(() => {
    if (resolvedIssues.length === 0) return null;
    const total = resolvedIssues.reduce((s, i) => s + i.daysOpen, 0);
    return Number((total / resolvedIssues.length).toFixed(1));
  }, [resolvedIssues]);
  const resolvedLast30 = useMemo(() => {
    const cutoff = now - 30 * 86400000;
    return resolvedIssues.filter((i) => i.resolvedAt && new Date(i.resolvedAt).getTime() >= cutoff).length;
  }, [resolvedIssues, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (showAll ? issues : openIssues).filter((i) => {
      if (!q) return true;
      const haystack = [i.panelTag, i.jobNumber, i.customer, i.missingDescription, i.reportedByName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [issues, openIssues, showAll, search]);

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Packout Issues</h1>
          <p className="text-sm text-ink-500 mt-1">
            Every time a packout verification found something missing — real evidence for where a hold-up is
            actually coming from
          </p>
        </div>
        <Button variant="ghost" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold text-ink-900">FabTek Industries — Packout Verification Issues</h1>
        <p className="text-sm text-ink-500 mt-1">Missing items reported at packout verification, before build start</p>
        <p className="text-[11px] text-ink-400 mt-1">Generated {new Date().toLocaleString("en-US")}</p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard
          label="Open Issues"
          value={openIssues.length}
          sub="Still missing something"
          accent={openIssues.length > 0 ? "text-bad-600" : "text-ink-900"}
        />
        <StatCard label="Resolved (Last 30 Days)" value={resolvedLast30} sub="Parts arrived / verification finished" />
        <StatCard
          label="Avg Days to Resolve"
          value={avgDaysToResolve !== null ? avgDaysToResolve : "—"}
          sub={resolvedIssues.length ? `across ${resolvedIssues.length} resolved issue${resolvedIssues.length === 1 ? "" : "s"}` : "no resolved issues yet"}
        />
        <StatCard label="Total Reported" value={issues.length} sub="Since this report started tracking" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4 print:hidden">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search panel, job #, customer, or what's missing…"
          className="min-w-[240px] flex-1 rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] text-ink-700"
        />
        <Button variant={showAll ? "subtle" : "primary"} onClick={() => setShowAll(false)}>
          Open Only
        </Button>
        <Button variant={showAll ? "primary" : "subtle"} onClick={() => setShowAll(true)}>
          All Issues
        </Button>
      </div>

      <SectionTitle
        title={showAll ? "All Reported Issues" : "Open Issues"}
        subtitle={`${filtered.length} issue${filtered.length === 1 ? "" : "s"} shown`}
      />
      <Card padded={false} className="overflow-x-auto mb-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-ink-400 text-center py-8">
            {showAll
              ? "No packout issues have been reported yet."
              : "No open issues right now — every reported issue has been resolved."}
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3 font-semibold">Reported</th>
                <th className="px-4 py-3 font-semibold">Panel</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">What's Missing</th>
                <th className="px-4 py-3 font-semibold">Reported By</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i, idx) => (
                <tr
                  key={i.id}
                  className={`border-b border-paper-100 last:border-0 ${
                    !i.resolved ? "bg-bad-50/30" : idx % 2 === 1 ? "bg-paper-50/60" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 text-ink-600 whitespace-nowrap">{formatDateTime(i.reportedAt)}</td>
                  <td className="px-4 py-2.5 text-ink-900 font-medium">
                    {i.panelTag}
                    {i.jobNumber && <span className="text-ink-400"> · Job #{i.jobNumber}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{i.customer || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-700">{i.missingDescription || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-600">{i.reportedByName}</td>
                  <td className="px-4 py-2.5">
                    {i.resolved ? (
                      <span className="inline-flex flex-col">
                        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-good-50 text-good-600 w-fit">
                          Resolved
                        </span>
                        <span className="text-[10px] text-ink-400 mt-1">
                          after {i.daysOpen} day{i.daysOpen === 1 ? "" : "s"} · {formatDateTime(i.resolvedAt)}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex flex-col">
                        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-bad-50 text-bad-600 w-fit">
                          Still Missing
                        </span>
                        <span className="text-[10px] text-ink-400 mt-1">
                          open {i.daysOpen} day{i.daysOpen === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <SectionTitle title="Methodology" />
      <Card className="text-[12px] text-ink-600 leading-relaxed space-y-2">
        <p>
          <strong className="text-ink-900">Where this comes from.</strong> Every panel goes through a "Verifying
          Packout" check before the build starts — a Lead Panel Technician (currently Cierra) checks the incoming kit
          against its parts list. As of this report, stopping a Verifying Packout session requires answering whether
          everything needed was there; if not, a description of what's missing is required too. This is a real,
          required answer captured on every packout check going forward, not a note that can be skipped or lost.
        </p>
        <p>
          <strong className="text-ink-900">An issue counts as resolved</strong> once a later packout check on the
          same panel either reports nothing missing, or verification is finished — whichever happens first. "Days
          open" for a resolved issue is the real time between the report and that resolution; for a still-open issue,
          it's the time since it was reported.
        </p>
        <p>
          <strong className="text-ink-900">Data starts from when this feature deployed, not earlier.</strong> The
          Stop Session screen has had a free-text Notes field for a while, and it's likely what was used to record a
          missing item before now — but that field was never actually saved to the record, so nothing typed into it
          before this deployed can be recovered or shown here. Every issue on this page reflects a real, structured
          report logged after that gap was closed.
        </p>
      </Card>
    </div>
  );
}
