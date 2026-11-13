import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { Card, SectionTitle, Button, formatDateTime } from "../../components/ui";
import KitUploadModal from "../../components/KitUploadModal";
import KitDeleteModal from "../../components/KitDeleteModal";
import { deleteKit, fetchOutstandingLines, useKitList } from "../../data/kitStore";
import { buildDailyStatusModel, dailyReportFileName } from "../../data/kitDailyReport";

// Pack-out Kits (SANDBOX) — one row per Siemens kit that's been uploaded.
export default function Kits() {
  const { panels, workHistory, activeSessions } = useApp();
  const { kits, loading, error, reload } = useKitList();
  const [deleting, setDeleting] = useState(null);
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [dropFile, setDropFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState("");

  // Daily status PDF for Siemens: counts + lists built from live data at the
  // moment of the click, so it's always "as of now".
  async function downloadDailyReport() {
    setReporting(true);
    setReportError("");
    try {
      const [outstanding, { buildDailyReportPdf }] = await Promise.all([fetchOutstandingLines(), import("../../data/kitDailyPdf")]);
      const now = new Date();
      const model = buildDailyStatusModel({ kits, panels, workHistory, activeSessions, outstanding, now });
      buildDailyReportPdf(model).save(dailyReportFileName(now));
    } catch (e) {
      setReportError(e?.message || String(e));
    } finally {
      setReporting(false);
    }
  }

  const panelByBuild = useMemo(() => new Map(panels.map((p) => [p.buildId, p])), [panels]);
  const existing = useMemo(() => new Set(kits.map((k) => k.buildId)), [kits]);
  const shown = kits.filter((k) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const p = panelByBuild.get(k.buildId);
    return `${k.panelId} ${k.soNumber} ${k.topPn} ${p?.customer ?? ""} ${p?.jobNumber ?? ""}`.toLowerCase().includes(q);
  });

  return (
    <div
      className="p-8 max-w-6xl min-h-[80vh] relative"
      onDragOver={(e) => {
        if ([...(e.dataTransfer?.types || [])].includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = [...e.dataTransfer.files].find((x) => /\.zip$/i.test(x.name)) || e.dataTransfer.files[0];
        if (f) {
          setDropFile(f);
          setShowUpload(true);
        }
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 rounded-xl border-4 border-dashed border-brand-500 bg-brand-50/90 flex items-center justify-center pointer-events-none">
          <p className="text-xl font-bold text-brand-600">Drop the Siemens zip anywhere to add it</p>
        </div>
      )}
      <SectionTitle
        title="Pack-out Kits"
        subtitle="Verify each Siemens kit against its parts list, report what's missing, and log it when it arrives."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={downloadDailyReport} disabled={reporting || loading || kits.length === 0}>
              {reporting ? "Building…" : "Daily report (PDF)"}
            </Button>
            <Button onClick={() => setShowUpload(true)}>+ Add kit (zip)</Button>
          </div>
        }
      />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search panel, SO, part…"
        className="w-full max-w-sm rounded-lg border border-paper-200 px-3 py-2 text-[13px] mb-4"
      />
      {error && <p className="text-sm text-bad-600 mb-3">Couldn't load kits: {error}</p>}
      {reportError && <p className="text-sm text-bad-600 mb-3">Couldn't build the daily report: {reportError}</p>}
      <Card padded={false}>
        {loading ? (
          <p className="p-8 text-sm text-ink-500 text-center">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-8 text-sm text-ink-500 text-center">{kits.length ? "No kits match that search." : "No kits yet — add the Siemens zip for a panel to get started."}</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500 border-b border-paper-200">
                <th className="px-4 py-3">Panel</th>
                <th className="px-4 py-3">Siemens order</th>
                <th className="px-4 py-3 w-56">Verified</th>
                <th className="px-4 py-3">Outstanding</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((k) => {
                const p = panelByBuild.get(k.buildId);
                const c = k.counts;
                const checked = c.total - c.pending;
                const pct = c.total ? Math.round((checked / c.total) * 100) : 0;
                const out = c.missing + c.short;
                return (
                  <tr key={k.buildId} onClick={() => navigate(`/kit/${k.buildId}`)} className="border-b border-paper-100 hover:bg-paper-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">Panel {k.panelId}</p>
                      <p className="text-[11px] text-ink-500">{[p?.jobNumber && `Job ${p.jobNumber}`, p?.customer].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>SO {k.soNumber} · Item {k.itemNumber}</p>
                      <p className="text-[11px] text-ink-500 truncate max-w-[220px]">{k.topDescription}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-2 rounded-full bg-paper-100 overflow-hidden">
                        <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-ink-500 mt-1">
                        {checked} of {c.total} checked{c.pending === 0 && c.total > 0 ? " — verified" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {out > 0 ? (
                        <span className="inline-flex rounded-full bg-bad-50 text-bad-600 text-[11px] font-bold px-2 py-0.5">{out} missing/short</span>
                      ) : c.received > 0 ? (
                        <span className="inline-flex rounded-full bg-good-50 text-good-600 text-[11px] font-bold px-2 py-0.5">All received</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDateTime(k.uploadedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(k);
                        }}
                        className="rounded-lg border border-paper-200 px-3 py-2 text-[12px] font-semibold text-bad-600 hover:bg-bad-50 [touch-action:manipulation]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {deleting && (
        <KitDeleteModal
          kit={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteKit(deleting.buildId);
            setDeleting(null);
            reload();
          }}
        />
      )}
      {showUpload && (
        <KitUploadModal
          existingBuildIds={existing}
          initialFile={dropFile}
          onClose={() => {
            setShowUpload(false);
            setDropFile(null);
          }}
          onDone={(buildId) => {
            setShowUpload(false);
            setDropFile(null);
            navigate(`/kit/${buildId}`);
          }}
        />
      )}
    </div>
  );
}
