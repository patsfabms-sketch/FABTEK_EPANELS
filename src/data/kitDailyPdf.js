// The Daily Pack-out Status Report as a PDF (jsPDF), built from the model in
// kitDailyReport.js. Plain letter-size pages, safe to email to Siemens as-is.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatQty } from "./kitData";
import { verifiedText } from "./kitDailyReport";

const MARGIN = 40;
const INK = [31, 42, 53];
const MUTED = [110, 118, 128];
const GOOD = [22, 130, 80];
const BAD = [190, 45, 45];

const longDate = (d) =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
  " · " +
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const shortDate = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};

const soText = (r) => [r.so && `SO ${r.so}`, r.item && `Item ${r.item}`].filter(Boolean).join(" · ") || "—";

export function buildDailyReportPdf(model) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const s = model.summary;
  const generated = new Date(model.generatedAt);

  // ---- header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text(model.title, MARGIN, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`${model.company}  ·  As of ${longDate(generated)}`, MARGIN, 69);

  // ---- four big numbers ----
  const tiles = [
    { label: "Pack-outs on hand", value: s.onHand, sub: "kits on file" },
    { label: "Verified", value: s.verified, sub: `${s.notVerified} still being verified` },
    { label: "In progress", value: s.inProgress, sub: "being built now" },
    { label: "Ready to ship", value: s.readyToShip, sub: "wrap complete" },
  ];
  const gap = 10;
  const tileW = (pageW - MARGIN * 2 - gap * 3) / 4;
  const tileY = 86;
  const tileH = 70;
  tiles.forEach((t, i) => {
    const x = MARGIN + i * (tileW + gap);
    doc.setDrawColor(215, 220, 226);
    doc.setFillColor(248, 249, 251);
    doc.roundedRect(x, tileY, tileW, tileH, 5, 5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(t.label.toUpperCase(), x + 10, tileY + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(...(i === 3 ? GOOD : INK));
    doc.text(String(t.value), x + 10, tileY + 46);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(t.sub, x + 10, tileY + 60);
  });

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const note = [
    `${s.waiting} waiting to start`,
    `${s.withOutstanding} kit${s.withOutstanding === 1 ? "" : "s"} with missing or short parts`,
    `${s.outstandingLines} part line${s.outstandingLines === 1 ? "" : "s"} still needed from Siemens`,
  ].join("   ·   ");
  doc.text(note, MARGIN, tileY + tileH + 18);

  let y = tileY + tileH + 40;

  const section = (title, count, blurb) => {
    if (y > pageH - 130) {
      doc.addPage();
      y = 52;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...INK);
    doc.text(`${title} (${count})`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    if (blurb) doc.text(blurb, MARGIN, y + 12);
    y += blurb ? 20 : 12;
  };

  const common = {
    theme: "grid",
    headStyles: { fillColor: INK, textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 4, valign: "middle", lineColor: [215, 220, 226] },
    margin: { left: MARGIN, right: MARGIN, bottom: 44 },
  };

  const verifyStyle = (data) => {
    if (data.section !== "body") return;
    const txt = String(data.cell.raw ?? "");
    if (txt === "Verified") {
      data.cell.styles.textColor = GOOD;
      data.cell.styles.fontStyle = "bold";
    }
  };
  const outStyle = (data) => {
    if (data.section === "body" && String(data.cell.raw).includes("missing")) {
      data.cell.styles.textColor = BAD;
      data.cell.styles.fontStyle = "bold";
    }
  };
  const outText = (r) => (r.outstandingLines > 0 ? `${r.outstandingLines} missing/short` : "None");

  const kitTable = (rows, dateHeader) => {
    autoTable(doc, {
      ...common,
      startY: y,
      head: [["Panel", "Siemens order", "Assembly", ...(dateHeader ? [dateHeader] : []), "Parts check", "Missing parts"]],
      body: rows.map((r) => [
        r.panelId,
        soText(r),
        r.description || r.topPn || "—",
        ...(dateHeader ? [shortDate(r.wrappedAt)] : []),
        verifiedText(r),
        outText(r),
      ]),
      columnStyles: dateHeader ? { 0: { cellWidth: 44, fontStyle: "bold" }, 1: { cellWidth: 98 }, 3: { cellWidth: 56 }, 4: { cellWidth: 74 }, 5: { cellWidth: 70 } } : { 0: { cellWidth: 44, fontStyle: "bold" }, 1: { cellWidth: 98 }, 3: { cellWidth: 74 }, 4: { cellWidth: 70 } },
      didParseCell: (data) => {
        const last = data.column.index === (dateHeader ? 5 : 4);
        const verifyCol = data.column.index === (dateHeader ? 4 : 3);
        if (verifyCol) verifyStyle(data);
        if (last) outStyle(data);
      },
    });
    y = doc.lastAutoTable.finalY + 22;
  };

  const emptyLine = (text) => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(text, MARGIN, y + 4);
    y += 26;
  };

  // ---- sections ----
  section("Ready to ship", model.ready.length, "Wrap is complete on these panels, most recent first.");
  if (model.ready.length) kitTable(model.ready, "Wrapped");
  else emptyLine("Nothing is ready to ship right now.");

  section("In progress", model.progress.length, "Work has started on these panels but wrap is not complete.");
  if (model.progress.length) kitTable(model.progress);
  else emptyLine("No panels are in progress right now.");

  if (model.waiting.length) {
    section("Waiting to start", model.waiting.length, "Pack-out is on hand; no work has been logged on the panel yet.");
    kitTable(model.waiting);
  }

  section("Parts we still need from Siemens", model.needs.length, "Missing or short parts found during pack-out verification.");
  if (model.needs.length) {
    autoTable(doc, {
      ...common,
      startY: y,
      head: [["Panel", "Siemens order", "Part number", "Description", "Unit", "Need", "Have", "Short"]],
      body: model.needs.map((n) => [
        n.panelId,
        soText(n),
        n.pn,
        n.description,
        n.unit,
        formatQty(n.qtyRequired),
        formatQty(n.qtyReceived),
        formatQty(n.qtyShort),
      ]),
      columnStyles: {
        0: { cellWidth: 40, fontStyle: "bold" },
        1: { cellWidth: 92 },
        2: { cellWidth: 84 },
        4: { cellWidth: 28 },
        5: { halign: "right", cellWidth: 30 },
        6: { halign: "right", cellWidth: 30 },
        7: { halign: "right", cellWidth: 32, fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 12;
  } else {
    emptyLine("No missing or short parts on file.");
  }

  // ---- footer on every page ----
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${model.company} — ${model.title} — ${longDate(generated)}`, MARGIN, pageH - 22);
    doc.text(`Page ${i} of ${pages}`, pageW - MARGIN, pageH - 22, { align: "right" });
  }
  return doc;
}
