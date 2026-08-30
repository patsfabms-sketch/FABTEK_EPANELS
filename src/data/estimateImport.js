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

    rows.push({
      id: rawId,
      customer: customerCol !== -1 ? cells[customerCol]?.trim() : "",
      order: orderCol !== -1 ? cells[orderCol]?.trim() : "",
      price,
    });
  }

  return { rows, errors };
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

// A line item row, once joined, reads like:
//   "1. Misc Sales No Tax 109967 FIRST ENERGY 1 $944.00 $944.00"
// The product/service name varies by QuickBooks setup, so instead of
// matching it literally, this pulls out (in order): the leading item
// number, the trailing qty + two dollar amounts, and — from what's left —
// the first standalone number (the panel/job ID) and everything after it
// (the customer/project name).
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
    price: amount,
  };
}

function parseEstimateLines(lines) {
  const billTo = extractBillToName(lines);
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
      order: billTo,
      price: parsed.price,
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
