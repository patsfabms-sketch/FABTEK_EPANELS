import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { computePackoutIssues } from "../../data/mockData";
import { Card, SectionTitle, StatCard, Button, Modal, formatDateTime } from "../../components/ui";

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
  const { panels, workHistory, employees, setPackoutIssueStatus } = useApp();
  const [editingIssue, setEditingIssue] = useState(null);
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
  const receivedCount = useMemo(() => issues.filter((i) => i.resolutionType === "received").length, [issues]);
  const shippedWithoutCount = useMemo(() => issues.filter((i) => i.resolutionType === "shipped_without").length, [issues]);
  const reverifiedCount = useMemo(() => issues.filter((i) => i.resolutionType === "reverified").length, [issues]);

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
        <StatCard label="Part Received" value={receivedCount} sub="Missing part arrived" accent={receivedCount > 0 ? "text-good-600" : "text-ink-900"} />
        <StatCard
          label="Shipped Without Part"
          value={shippedWithoutCount}
          sub="Panel went out missing it"
          accent={shippedWithoutCount > 0 ? "text-warn-600" : "text-ink-900"}
        />
        <StatCard
          label="Avg Days to Resolve"
          value={avgDaysToResolve !== null ? avgDaysToResolve : "—"}
          sub={resolvedIssues.length ? `across ${resolvedIssues.length} resolved issue${resolvedIssues.length === 1 ? "" : "s"}` : "no resolved issues yet"}
        />
        <StatCard
          label="Total Reported"
          value={issues.length}
          sub={reverifiedCount > 0 ? `${reverifiedCount} closed by a clean re-check` : "Since this report started tracking"}
        />
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
                <th className="px-4 py-3 font-semibold text-right print:hidden">Update</th>
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
                        <span
                          className={`text-[10px] font-semibold rounded-full px-2 py-0.5 w-fit ${
                            i.resolutionType === "shipped_without" ? "bg-warn-50 text-warn-600" : "bg-good-50 text-good-600"
                          }`}
                        >
                          {STATUS_LABEL[i.resolutionType] ?? "Resolved"}
                        </span>
                        <span className="text-[10px] text-ink-400 mt-1">
                          after {i.daysOpen} day{i.daysOpen === 1 ? "" : "s"} · {formatDateTime(i.resolvedAt)}
                        </span>
                        {i.resolutionNote && <span className="text-[11px] text-ink-600 mt-1 max-w-[220px]">{i.resolutionNote}</span>}
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
                  <td className="px-4 py-2.5 text-right print:hidden">
                    <button
                      onClick={() => setEditingIssue(i)}
                      className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap"
                    >
                      {i.resolved ? "Change Status" : "Update Status"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editingIssue && (
        <UpdateStatusModal
          issue={editingIssue}
          siblings={openIssues.filter((o) => o.buildId === editingIssue.buildId && o.id !== editingIssue.id)}
          onClose={() => setEditingIssue(null)}
          onSave={(ids, payload) => {
            setPackoutIssueStatus(ids, payload);
            setEditingIssue(null);
          }}
        />
      )}

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
          <strong className="text-ink-900">Status is set by a person.</strong> From the Update column an admin marks
          each issue <em>Part Received</em> (the missing part arrived) or <em>Shipped Without Part</em> (the panel
          went out without it), with the date it happened and an optional note — a real record of what actually
          occurred, not a guess. Either one closes the issue; an issue can be reopened at any time. A panel that
          shipped without a part stays counted as an issue that was reported, so it still shows up as evidence of a
          short kit.
        </p>
        <p>
          <strong className="text-ink-900">An issue with no manual status can still close itself</strong> if a later
          packout check on the same panel reports nothing missing, or verification is finished (shown as "Re-verified
          complete"). A manual status always takes precedence. "Days open" is the real time between the report and
          whichever resolution applies; for a still-open issue, it's the time since it was reported.
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

const STATUS_LABEL = {
  received: "Part Received",
  shipped_without: "Shipped Without Part",
  reverified: "Re-verified complete",
};

function localDateString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A date-only pick becomes a real timestamp: "right now" if it's today (so
// days-open stays precise), otherwise noon local on the chosen day — safely
// inside the day regardless of timezone.
function dateToIso(dateStr) {
  if (dateStr === localDateString()) return new Date().toISOString();
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

function UpdateStatusModal({ issue, siblings, onClose, onSave }) {
  const [choice, setChoice] = useState(issue.isManual ? issue.resolutionType : "");
  const [date, setDate] = useState(() =>
    issue.isManual && issue.resolvedAt ? localDateString(new Date(issue.resolvedAt)) : localDateString()
  );
  const [note, setNote] = useState(issue.resolutionNote || "");
  const [applyToSiblings, setApplyToSiblings] = useState(true);
  const [error, setError] = useState("");

  const minDate = localDateString(new Date(issue.reportedAt));
  const maxDate = localDateString();

  function handleSave() {
    if (!choice) {
      setError("Pick what happened: part received, or shipped without it.");
      return;
    }
    if (!date || date < minDate || date > maxDate) {
      setError("Pick a date between when it was reported and today.");
      return;
    }
    const ids = [issue.id, ...(applyToSiblings && !issue.isManual ? siblings.map((s) => s.id) : [])];
    onSave(ids, { resolution: choice, resolvedAt: dateToIso(date), note });
  }

  const options = [
    { key: "received", title: "Part received", desc: "The missing part arrived and was added." },
    { key: "shipped_without", title: "Shipped without the part", desc: "The panel went out without it." },
  ];

  return (
    <Modal onClose={onClose} widthClass="max-w-[440px]">
      <h3 className="text-sm font-semibold text-ink-900 mb-1">
        Update status — {issue.panelTag}
        {issue.jobNumber && <span className="text-ink-400 font-normal"> · Job #{issue.jobNumber}</span>}
      </h3>
      <p className="text-[12px] text-ink-500 mb-4">
        Missing: <span className="text-ink-700">{issue.missingDescription || "(no description)"}</span>
      </p>

      <div className="space-y-2 mb-4">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              setChoice(o.key);
              setError("");
            }}
            className={`w-full text-left rounded-lg border px-3 py-2.5 ${
              choice === o.key
                ? o.key === "received"
                  ? "border-good-500 bg-good-50"
                  : "border-warn-500 bg-warn-50"
                : "border-paper-200 bg-white hover:bg-paper-50"
            }`}
          >
            <p className="text-[13px] font-semibold text-ink-900">{o.title}</p>
            <p className="text-[11px] text-ink-500">{o.desc}</p>
          </button>
        ))}
      </div>

      <label className="block text-[11px] font-semibold text-ink-700 mb-1">When did this happen?</label>
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => {
          setDate(e.target.value);
          setError("");
        }}
        className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] text-ink-700 mb-3"
      />

      <label className="block text-[11px] font-semibold text-ink-700 mb-1">Note (optional)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Siemens sent the relay on 10/22, or approved shipping without the knife switch"
        className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-[13px] text-ink-700 mb-3"
      />

      {!issue.isManual && siblings.length > 0 && (
        <label className="flex items-start gap-2 text-[12px] text-ink-600 mb-3">
          <input
            type="checkbox"
            checked={applyToSiblings}
            onChange={(e) => setApplyToSiblings(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also mark the {siblings.length} other open report{siblings.length === 1 ? "" : "s"} on this panel the same
            way
          </span>
        </label>
      )}

      {error && <p className="text-[12px] text-bad-600 mb-3">{error}</p>}

      <div className="flex items-center justify-between gap-2 mt-2">
        {issue.isManual ? (
          <button
            type="button"
            onClick={() => onSave([issue.id], { resolution: null })}
            className="text-[12px] font-semibold text-bad-600 hover:text-bad-700"
          >
            Reopen issue
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Status</Button>
        </div>
      </div>
    </Modal>
  );
}
