import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Parses a QuickBooks "Estimate" CSV export into panel records. QuickBooks
// export headers vary by report, so columns are matched loosely by keyword
// rather than an exact schema.

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

// Checks candidates in priority order (not header order) so a specific match
// like "product/service" wins over a generic one like "num" (QuickBooks' Num
// column is usually the estimate number, not a panel/job identifier).
function findColumn(header, candidates) {
  for (const c of candidates) {
    const idx = header.findIndex((h) => h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseEstimateCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: ["File is empty or missing a header row."] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idCol = findColumn(header, ["panel", "job", "product/service", "num"]);
  const customerCol = findColumn(header, ["customer", "client"]);
  const orderCol = findColumn(header, ["description", "memo", "item"]);
  const priceCol = findColumn(header, ["amount", "total", "price", "rate"]);
  const poCol = findColumn(header, ["po number", "po #", "p.o.", "purchase order"]);
  const jobNumberCol = findColumn(header, ["estimate no", "estimate #", "estimate number"]);

  if (idCol === -1 || priceCol === -1) {
    return {
      rows: [],
      errors: ["Couldn't find a panel/job column and an amount column in the CSV header."],
    };
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rawId = cells[idCol]?.trim().replace(/^#/, "");
    const rawPrice = cells[priceCol]?.replace(/[$,]/g, "").trim();
    const price = Number(rawPrice);

    if (!rawId || !Number.isFinite(price) || price <= 0) {
      errors.push(`Row ${i + 1}: skipped (missing panel ID or invalid amount).`);
      continue;
    }

    const rawJobNumber = jobNumberCol !== -1 ? cells[jobNumberCol]?.trim() : "";

    rows.push({
      id: rawId,
      customer: customerCol !== -1 ? cells[customerCol]?.trim() : "",
      order: orderCol !== -1 ? cells[orderCol]?.trim() : "",
      price,
      jobNumber: rawJobNumber ? stripJobNumberYear(rawJobNumber) : "",
      poNumber: poCol !== -1 ? cells[poCol]?.trim() : "",
    });
  }

  return { rows, errors };
}

// QuickBooks estimate numbers are formatted "2026-1234" (year-sequence). The
// year prefix is meaningful to QuickBooks but not to the shop floor — the
// job number shown everywhere in AssemblyOS is just the sequence part.
function stripJobNumberYear(raw) {
  const match = raw.match(/^\s*20\d{2}-(\d+)\s*$/);
  return match ? match[1] : raw;
}

// ---------------------------------------------------------------------------
// PDF import — parses a QuickBooks Estimate exported/printed as a PDF (the
// "Save as PDF" / emailed estimate, not a data export). Layout observed:
//
//   Bill to
//   <Customer Name>
//   ...address...
//
//   # Product or service Description Qty Rate Amount
//   1. Misc Sales No Tax  109967 FIRST ENERGY   1  $944.00  $944.00
//
// Each line item's job/panel number and the actual end-customer are both
// packed into the "Description" cell (QuickBooks doesn't give it its own
// column here), so the parser pulls the first standalone 3+ digit token out
// of that cell as the panel ID and treats the remaining words as the
// customer — this is different from the CSV path, where those are normally
// separate, clearly-labeled columns.
// ---------------------------------------------------------------------------

// Groups a page's individual text runs (each with its own x/y position) back
// into visual lines. pdf.js hands back unordered runs, not pre-joined text.
function groupTextIntoLines(items) {
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const rows = [];
  let current = [];
  let currentY = null;
  const Y_TOLERANCE = 3;

  for (const item of sorted) {
    const y = item.transform[5];
    if (currentY !== null && Math.abs(y - currentY) > Y_TOLERANCE) {
      rows.push(current);
      current = [];
    }
    current.push(item);
    currentY = y;
  }
  if (current.length) rows.push(current);

  return rows
    .map((row) =>
      row
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function extractBillToName(lines) {
  const idx = lines.findIndex((l) => l.trim().toLowerCase() === "bill to");
  return idx !== -1 ? lines[idx + 1]?.trim() ?? "" : "";
}

// Document-level fields (apply to every line item on the same PDF, unlike
// the panel ID/customer/price which come from each line item's own row) —
// the QuickBooks estimate number (shown on the shop floor as just the
// sequence after the year, e.g. "2026-1234" -> "1234") and, if present, a
// PO number. Layout isn't fixed across QuickBooks accounts, so this matches
// loosely by keyword/pattern rather than a specific header position.
function extractDocumentFields(lines) {
  const joined = lines.join(" \n ");

  let jobNumber = "";
  const labeledEstimate = joined.match(/estimate\s*(?:no\.?|number|#)?\s*[:#]?\s*(20\d{2})-(\d{2,8})/i);
  if (labeledEstimate) {
    jobNumber = labeledEstimate[2];
  } else {
    const bareEstimate = joined.match(/\b(20\d{2})-(\d{2,8})\b/);
    if (bareEstimate) jobNumber = bareEstimate[2];
  }

  // Requires an explicit label ("PO Number", "P.O. #", "Purchase Order: ...")
  // rather than a bare "PO" — a bare match is too easy to trigger on an
  // unrelated word that happens to contain "po" (e.g. "Deposit", "Reporting").
  let poNumber = "";
  const poMatch = joined.match(
    /\b(?:purchase\s*order|p\.?\s?o\.?\s*(?:no\.?|number|#))\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,19})/i
  );
  if (poMatch) poNumber = poMatch[1];

  return { jobNumber, poNumber };
}

// A line item row, once joined, reads like:
//   "1. Misc Sales No Tax 1100012 ENTERGY MISSISSIPPI 2 $732.00 $1,464.00"
// The product/service name varies by QuickBooks setup, so instead of
// matching it literally, this pulls out (in order): the leading item
// number, the trailing qty + two dollar amounts, and — from what's left —
// the first standalone number onward, which is the Description cell as
// QuickBooks renders it here ("1100012 ENTERGY MISSISSIPPI" — an internal
// panel/job tag followed by the end customer, packed into one cell). That
// whole cell is kept verbatim as the panel's description; the leading
// number doubles as this app's internal panel id, and everything after it
// as the customer name.
function parseLineItemRow(line) {
  const itemMatch = line.match(/^(\d+)\.\s+(.*)$/);
  if (!itemMatch) return null;
  const rest = itemMatch[2];

  const amounts = [...rest.matchAll(/\$([\d,]+\.\d{2})/g)];
  if (amounts.length === 0) return null;
  const amount = Number(amounts[amounts.length - 1][1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const dollarIndex = rest.indexOf("$");
  const beforeAmounts = (dollarIndex === -1 ? rest : rest.slice(0, dollarIndex)).trim();
  const words = beforeAmounts.split(/\s+/);
  if (words.length && /^\d+$/.test(words[words.length - 1])) words.pop(); // trailing qty

  const numIdx = words.findIndex((w) => /^\d{3,}$/.test(w));
  if (numIdx === -1) return null;

  return {
    id: words[numIdx],
    customer: words.slice(numIdx + 1).join(" ").trim(),
    description: words.slice(numIdx).join(" "),
    price: amount,
  };
}

function parseEstimateLines(lines) {
  const billTo = extractBillToName(lines);
  const { jobNumber, poNumber } = extractDocumentFields(lines);
  const rows = [];
  const errors = [];

  lines.forEach((line, i) => {
    if (!/^\d+\.\s/.test(line)) return; // not a numbered line-item row
    const parsed = parseLineItemRow(line);
    if (!parsed) {
      errors.push(`Line ${i + 1}: couldn't read a panel number and amount from "${line}".`);
      return;
    }
    rows.push({
      id: parsed.id,
      customer: parsed.customer || billTo || "Unknown Customer",
      order: parsed.description || billTo,
      price: parsed.price,
      jobNumber,
      poNumber,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push("No line items found — this doesn't look like a QuickBooks estimate PDF.");
  }

  return { rows, errors };
}

export async function parseEstimatePdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const lines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    lines.push(...groupTextIntoLines(content.items));
  }

  return parseEstimateLines(lines);
}
