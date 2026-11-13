// Daily Pack-out Status Report for Siemens — PURE functions only (no React, no
// Supabase, no browser APIs) so the numbers can be tested in plain Node.
//
// One report answers: how many pack-out kits are on hand, how many are
// verified, how many panels are in progress, which are ready to ship, and
// which parts we still need from Siemens.
//
// Every kit lands in exactly ONE "where is it" group, using the same
// definitions the Panels page uses so the two never disagree:
//   Ready to ship  a completed Wrap session is on file for the kit's panel build
//   In progress    any work logged on the build (or someone is scanned in now)
//   Not started    nothing logged yet
// "Verified" is separate — it is about the kit's parts list (every part
// checked), not where the panel is, so a kit can be verified and in progress.
//
// Nothing here carries money, hours or employee names: it is built to be sent
// to the customer.

import { sentInfoForBuild } from "./mockData.js";

export const GROUP = { READY: "ready", PROGRESS: "progress", WAITING: "waiting" };

/**
 * kits         from fetchKits() (each has counts {total,pending,got,missing,short,received})
 * panels       app panels (buildId, id, jobNumber …)
 * workHistory  completed sessions
 * activeSessions  sessions in progress right now
 * outstanding  missing/short lines across all kits (fetchOutstandingLines()), optional
 */
export function buildDailyStatusModel({ kits, panels, workHistory, activeSessions = [], outstanding = [], now = new Date() }) {
  const panelByBuild = new Map(panels.map((p) => [p.buildId, p]));
  const touched = new Set();
  for (const h of workHistory) touched.add(h.buildId);
  for (const s of activeSessions) touched.add(s.buildId);

  const outByBuild = new Map();
  for (const l of outstanding) {
    if (!outByBuild.has(l.buildId)) outByBuild.set(l.buildId, []);
    outByBuild.get(l.buildId).push(l);
  }

  const rows = kits.map((k) => {
    const panel = panelByBuild.get(k.buildId);
    const c = k.counts;
    const verified = c.total > 0 && c.pending === 0;
    const sent = panel ? sentInfoForBuild(workHistory, panel) : { isSent: false, sentAt: null };
    const group = sent.isSent ? GROUP.READY : touched.has(k.buildId) ? GROUP.PROGRESS : GROUP.WAITING;
    return {
      buildId: k.buildId,
      panelId: k.panelId || panel?.id || "",
      jobNumber: panel?.jobNumber || "",
      so: k.soNumber,
      item: k.itemNumber,
      topPn: k.topPn,
      description: k.topDescription,
      group,
      wrappedAt: sent.sentAt,
      verified,
      checked: c.total - c.pending,
      total: c.total,
      outstandingLines: c.missing + c.short,
      uploadedAt: k.uploadedAt,
    };
  });

  const bySort = (a, b) => String(a.panelId).localeCompare(String(b.panelId), undefined, { numeric: true });
  const ready = rows.filter((r) => r.group === GROUP.READY).sort((a, b) => (b.wrappedAt ?? 0) - (a.wrappedAt ?? 0));
  const progress = rows.filter((r) => r.group === GROUP.PROGRESS).sort(bySort);
  const waiting = rows.filter((r) => r.group === GROUP.WAITING).sort(bySort);

  const rowByBuild = new Map(rows.map((r) => [r.buildId, r]));
  const needs = outstanding
    .filter((l) => rowByBuild.has(l.buildId))
    .map((l) => {
      const r = rowByBuild.get(l.buildId);
      const short = Math.max(0, Math.round((l.qtyRequired - l.qtyReceived) * 1000) / 1000);
      return {
        buildId: l.buildId,
        panelId: r.panelId,
        so: r.so,
        item: r.item,
        pn: l.pn,
        description: l.description,
        unit: l.unit,
        qtyRequired: l.qtyRequired,
        qtyReceived: l.qtyReceived,
        qtyShort: short,
        status: l.status === "short" ? "Short" : "Missing",
      };
    })
    .sort((a, b) => bySort(a, b) || String(a.pn).localeCompare(String(b.pn)));

  return {
    company: "FabTek Industries",
    title: "Daily Pack-out Status Report",
    generatedAt: now.toISOString(),
    summary: {
      onHand: rows.length,
      verified: rows.filter((r) => r.verified).length,
      notVerified: rows.filter((r) => !r.verified).length,
      withOutstanding: rows.filter((r) => r.outstandingLines > 0).length,
      inProgress: progress.length,
      readyToShip: ready.length,
      waiting: waiting.length,
      outstandingLines: needs.length,
    },
    ready,
    progress,
    waiting,
    needs,
  };
}

// "Verified" label for a table cell.
export function verifiedText(r) {
  if (r.total === 0) return "No parts list";
  return r.verified ? "Verified" : `${r.checked} of ${r.total} checked`;
}


export function dailyReportFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `FabTek_Daily_Packout_Report_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.pdf`;
}
