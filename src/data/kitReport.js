// Browser-side output for the Missing Parts Report: PDF (jsPDF), CSV and
// plain email text. All three come from the same model built in kitData.js.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatQty, reportDateString, reportToCsv } from "./kitData";

export function reportFileBase(model) {
  const h = model.header;
  const parts = ["Missing_Parts", h.so && `SO${h.so}`, h.item && `Item${h.item}`, h.panelId && `Panel${h.panelId}`].filter(Boolean);
  return parts.join("_").replace(/[^A-Za-z0-9_-]+/g, "_");
}

export function buildReportPdf(model) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const h = model.header;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(model.title, margin, 52);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text(`${model.company}  ·  Pack-out verification  ·  ${reportDateString(model.generatedAt)}`, margin, 68);
  doc.setTextColor(0);

  const info = [
    ["Sales order / item", [h.so, h.item].filter(Boolean).join(" / ") || "—"],
    ["Assembly", [h.topPn, h.topDescription].filter(Boolean).join("  ") || "—"],
    ["FabTek panel / job", [h.panelId, h.jobNumber].filter(Boolean).join(" / ") || "—"],
    ["Prepared by", model.preparedBy || "—"],
  ];
  autoTable(doc, {
    startY: 82,
    body: info,
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: { top: 2, bottom: 2, left: 0, right: 8 } },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 110 } },
    margin: { left: margin, right: margin },
  });

  const afterInfo = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  const s = model.summary;
  doc.text(
    `${s.outstandingLines} line${s.outstandingLines === 1 ? "" : "s"} outstanding · ${formatQty(s.outstandingPieces)} pieces to ship`,
    margin,
    afterInfo + 8
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Verified ${s.checkedLines} of ${s.totalLines} parts on the list${s.notYetChecked ? ` (${s.notYetChecked} not yet checked)` : ""}.`, margin, afterInfo + 22);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: afterInfo + 32,
    head: [["#", "Part number", "Description", "Unit", "Need", "Have", "Short", "Status"]],
    body: model.rows.map((r, i) => [
      i + 1,
      r.pn,
      r.description + (r.refs ? `\nRef: ${r.refs}` : "") + (r.note ? `\nNote: ${r.note}` : ""),
      r.unit,
      formatQty(r.qtyRequired),
      formatQty(r.qtyReceived),
      formatQty(r.qtyShort),
      r.status,
    ]),
    theme: "grid",
    headStyles: { fillColor: [31, 42, 53], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 4, valign: "top" },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 100 },
      3: { cellWidth: 30 },
      4: { halign: "right", cellWidth: 38 },
      5: { halign: "right", cellWidth: 38 },
      6: { halign: "right", cellWidth: 38, fontStyle: "bold" },
      7: { cellWidth: 48 },
    },
    margin: { left: margin, right: margin, bottom: 40 },
    didDrawPage: () => {
      const n = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${model.company} — ${model.title}`, margin, doc.internal.pageSize.getHeight() - 22);
      doc.text(`Page ${n}`, pageW - margin, doc.internal.pageSize.getHeight() - 22, { align: "right" });
      doc.setTextColor(0);
    },
  });
  return doc;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadReportPdf(model) {
  buildReportPdf(model).save(`${reportFileBase(model)}.pdf`);
}

export function downloadReportCsv(model) {
  downloadBlob(new Blob([reportToCsv(model)], { type: "text/csv;charset=utf-8" }), `${reportFileBase(model)}.csv`);
}
