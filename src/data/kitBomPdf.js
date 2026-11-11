// The "marked-up BOM" printout: Siemens' own BOM, in the same order and the
// same four-column layout they already know (position + level, item number +
// description, part number + category, quantity + unit), with every
// missing / short part highlighted like a highlighter pen and the missing
// quantity written beside it in blue, plus FabTek's panel number and customer
// in the margin. It replaces highlighting a paper BOM and photographing it.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatQty, outstandingLines, qtyShort, reportDateString } from "./kitData";

const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 34;
const TABLE_W = 424; // BOM columns end here; the rest of the page is margin for notes
const NOTE_X = LEFT + TABLE_W + 8;
const TOP = 74;
const BOTTOM = 40;
const ROW_H = 9.6;
const ROWS_PER_PAGE = Math.floor((PAGE_H - TOP - BOTTOM) / ROW_H);
const BLUE = [24, 52, 196];

const COL = { pos: LEFT + 2, item: LEFT + 56, pn: LEFT + 232, cat: LEFT + 338, qty: LEFT + 352, unit: LEFT + 398 };

const stripZeros = (s) => String(s ?? "").replace(/^0+(?=\d)/, "");

// Cut text to a width the way a printout would, ending in … when clipped.
function clip(doc, text, maxW) {
  const t = String(text ?? "");
  if (doc.getTextWidth(t) <= maxW) return t;
  let out = t;
  while (out.length > 1 && doc.getTextWidth(out + "…") > maxW) out = out.slice(0, -1);
  return out + "…";
}

/**
 * Build the marked-up BOM PDF.
 *   rows           parsed BOM rows (parseBom(...).rows)
 *   lines          the kit's checklist lines (only missing/short ones are marked)
 *   onlyMarkedPages  true = the summary page + only BOM pages that have a highlight
 */
export function buildMarkedBomPdf({ rows, lines, kit, panel, preparedBy = "", onlyMarkedPages = true, now = new Date() }) {
  const out = outstandingLines(lines);
  const byKey = new Map(out.map((l) => [`${l.pn}||${l.unit}`, l]));
  const firstSeen = new Set();

  // Decide per row: highlighted? what to write beside it?
  const marks = rows.map((r) => {
    if (r.isNote || !r.isLeaf) return null;
    const line = byKey.get(`${String(r.pn).replace(/\s+/g, " ").trim()}||${r.unit}`);
    if (!line) return null;
    if (line.status === "short") {
      if (firstSeen.has(line.id ?? line.pn)) return { tone: "short", text: "(short — see above)" };
      firstSeen.add(line.id ?? line.pn);
      return {
        tone: "short",
        text: `SHORT: ${formatQty(qtyShort(line))} ${line.unit} missing`,
        sub: `(have ${formatQty(line.qtyReceived)} of ${formatQty(line.qtyRequired)})`,
      };
    }
    return { tone: "missing", text: `MISSING  Qty: ${formatQty(r.expQty)} ${r.unit}` };
  });

  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pages = [];
  for (let p = 0; p < pageCount; p++) {
    const start = p * ROWS_PER_PAGE;
    const slice = rows.slice(start, start + ROWS_PER_PAGE);
    const hasMark = slice.some((_, i) => marks[start + i]);
    if (!onlyMarkedPages || hasMark) pages.push({ n: p + 1, start, slice });
  }

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const header = {
    so: kit?.soNumber || "",
    item: kit?.itemNumber || "",
    top: [kit?.topPn, kit?.topDescription].filter(Boolean).join("  "),
    panelId: panel?.id || kit?.panelId || "",
    job: panel?.jobNumber || "",
    customer: panel?.customer || "",
  };

  // ---- page 1: summary ----------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Missing Parts — Pack-out Verification", LEFT, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`FabTek Industries  ·  ${reportDateString(now.toISOString())}`, LEFT, 68);
  doc.setTextColor(0);
  autoTable(doc, {
    startY: 82,
    body: [
      ["Sales order / item", [header.so, header.item].filter(Boolean).join(" / ") || "—"],
      ["Assembly", header.top || "—"],
      ["FabTek panel / job", [header.panelId, header.job].filter(Boolean).join(" / ") || "—"],
      ["Customer", header.customer || "—"],
      ["Prepared by", preparedBy || "—"],
    ],
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 2, bottom: 2, left: 0, right: 8 } },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 115 } },
    margin: { left: LEFT, right: LEFT },
  });
  const piecesShort = out.reduce((s, l) => s + qtyShort(l), 0);
  let y = doc.lastAutoTable.finalY + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    out.length
      ? `${out.length} line${out.length === 1 ? "" : "s"} missing or short · ${formatQty(piecesShort)} pieces to ship`
      : "Nothing is missing or short.",
    LEFT,
    y
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("The pages after this one are your BOM, with each missing part highlighted and the quantity we need written beside it.", LEFT, y + 14);
  doc.setTextColor(0);
  if (out.length) {
    autoTable(doc, {
      startY: y + 24,
      head: [["#", "Part number", "Description", "Unit", "Need", "Have", "Missing"]],
      body: out.map((l, i) => [i + 1, l.pn, l.description + (l.refs ? `\nRef: ${l.refs}` : "") + (l.note ? `\nNote: ${l.note}` : ""), l.unit, formatQty(l.qtyRequired), formatQty(l.qtyReceived), formatQty(qtyShort(l))]),
      theme: "grid",
      headStyles: { fillColor: [31, 42, 53], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4, valign: "top" },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 100 }, 3: { cellWidth: 30 }, 4: { halign: "right", cellWidth: 38 }, 5: { halign: "right", cellWidth: 38 }, 6: { halign: "right", cellWidth: 44, fontStyle: "bold" } },
      margin: { left: LEFT, right: LEFT, bottom: 40 },
    });
  }
  const summaryPages = doc.getNumberOfPages();

  // ---- BOM pages ------------------------------------------------------------
  pages.forEach((pg) => {
    doc.addPage();
    // Page header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    doc.text(`SO ${header.so}   ITEM ${header.item}`, LEFT, 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(clip(doc, header.top, TABLE_W - 90), LEFT, 47);
    doc.setTextColor(120);
    doc.text(`BOM page ${pg.n} of ${pageCount}`, LEFT + TABLE_W, 36, { align: "right" });
    doc.setTextColor(0);

    // The "handwritten" panel / customer note in the right margin, as on the paper copy.
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(...BLUE);
    doc.setFontSize(13);
    doc.text(String(header.panelId), NOTE_X, 60);
    doc.setFontSize(10);
    const cust = doc.splitTextToSize(header.customer, PAGE_W - NOTE_X - 14);
    doc.text(cust.slice(0, 3), NOTE_X, 74);
    doc.setTextColor(0);

    // Column titles
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(110);
    const ty = TOP - 6;
    doc.text("POS  LEVEL", COL.pos, ty);
    doc.text("ITEM  DESCRIPTION", COL.item, ty);
    doc.text("PART NUMBER", COL.pn, ty);
    doc.text("QTY  UNIT", COL.qty, ty);
    doc.setDrawColor(190);
    doc.line(LEFT, TOP - 3, LEFT + TABLE_W, TOP - 3);
    doc.setTextColor(0);

    pg.slice.forEach((r, i) => {
      const yTop = TOP + i * ROW_H;
      const base = yTop + ROW_H - 2.6;
      const mark = marks[pg.start + i];
      if (mark) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.5 }));
        doc.setFillColor(...(mark.tone === "short" ? [255, 196, 64] : [255, 90, 170]));
        doc.rect(LEFT, yTop, TABLE_W, ROW_H, "F");
        doc.restoreGraphicsState();
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(20);
      doc.text(`${r.pos}  ${r.level}`, COL.pos, base);
      doc.text(clip(doc, `${stripZeros(r.itemNr)}  ${r.desc}`.trim(), COL.pn - COL.item - 4), COL.item, base);
      doc.text(clip(doc, r.pn, COL.cat - COL.pn - 3), COL.pn, base);
      doc.text(r.category || "", COL.cat, base);
      doc.text(`${r.qty}`, COL.qty, base);
      doc.text(r.unit || "", COL.unit, base);

      if (mark) {
        doc.setFont("helvetica", "bolditalic");
        doc.setTextColor(...BLUE);
        doc.setFontSize(8.5);
        const room = PAGE_W - NOTE_X - 8;
        doc.text(clip(doc, mark.text, room), NOTE_X, base);
        if (mark.sub) {
          // "(need 12, have 1)" on the same line so adjacent marked rows never collide
          const used = doc.getTextWidth(mark.text) + 4;
          doc.setFont("helvetica", "italic");
          doc.setFontSize(6.6);
          if (used + doc.getTextWidth(mark.sub) <= room) doc.text(mark.sub, NOTE_X + used, base);
        }
        doc.setTextColor(0);
      }
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`FabTek Industries — missing parts marked on BOM`, LEFT, PAGE_H - 22);
    doc.setTextColor(0);
  });

  // "Page x of y" across the whole PDF.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`Page ${p} of ${total}`, PAGE_W - LEFT, PAGE_H - 22, { align: "right" });
  }
  doc.setTextColor(0);
  return { doc, markedRows: marks.filter(Boolean).length, bomPagesIncluded: pages.length, bomPagesTotal: pageCount, summaryPages };
}
