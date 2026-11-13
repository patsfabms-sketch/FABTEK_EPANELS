// Pack-out kit logic — PURE functions only (no React, no Supabase, no browser
// APIs), so every rule in here can be tested in plain Node against the real
// Siemens BOM files (see scripts/kitData.test.mjs).
//
// What a "kit" is: for one physical panel, the Siemens zip carries a nested
// bill of materials (BOM), drawings (PDF) and a wire list (xlsx). Whoever
// verifies pack-out walks the BOM's purchased parts and marks each one
// Got it / Missing / Short, and the outstanding ones feed a report to
// Siemens and a "received" flow when the parts finally arrive.

export const KIT_STATUS = {
  PENDING: "pending", // not checked yet
  GOT: "got", // checked: everything required is here
  MISSING: "missing", // checked: none of it is here
  SHORT: "short", // checked (or part-received): some, not all, is here
  RECEIVED: "received", // was missing/short, the rest has since arrived
};

export const KIT_STATUS_LABEL = {
  pending: "Not checked",
  got: "Got it",
  missing: "Missing",
  short: "Short",
  received: "Received",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function formatQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 1000) / 1000);
}

// Float-safe subtraction for quantities like 11.5 FT.
function qtyDiff(a, b) {
  return Math.round((Number(a) - Number(b)) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Siemens BOMs come comma-separated, but some exports are tab- or
// semicolon-separated. Pick whichever delimiter the header line uses most
// (ignoring anything inside quotes).
export function detectDelimiter(text) {
  const head = String(text ?? "").replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)[0] || "";
  const counts = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let inQ = false;
  for (const ch of head) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

// Minimal RFC-4180-style parser (quotes, doubled quotes, CRLF, BOM char).
export function parseCsv(text, delimiter = ",") {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === "") {
      // A quote only opens a quoted field at the START of a field. Siemens
      // descriptions contain bare inch marks (3" WIRE) that must stay text.
      inQuotes = true;
      field = "";
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

// ---------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------

const cleanPn = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// A note that merely labels the part printed just above it ("***** PBC *****",
// "***** TCM1 & TCM2 *****") — short device reference marks, not sentences.
function designatorText(raw) {
  const m = String(raw).trim().match(/^\*+\s*(.+?)\s*\*+$/);
  if (!m) return null;
  const text = m[1].trim();
  if (!text || /no picture/i.test(text)) return null;
  const tokens = text.split(/\s+/).map((t) => t.replace(/[.,&]/g, "")).filter(Boolean);
  if (tokens.length > 6) return null;
  if (tokens.some((t) => t.length > 5)) return null;
  return text;
}

// Strip the decoration Siemens wraps notes in (**** ... ****, #### ... ####).
function noteText(raw) {
  return String(raw ?? "")
    .replace(/^[\s*#]+|[\s*#]+$/g, "")
    .trim();
}

const isDecorated = (raw) => /^[\s]*[*#]/.test(String(raw ?? ""));

// "75018093_170_BOM_P3R72481361838C.csv" -> sales order 75018093, item 170.
export function parseBomFileName(fileName) {
  const base = String(fileName ?? "").split(/[\\/]/).pop();
  const m = base.match(/(?:^|_)(\d{6,12})_(\d{1,4})_BOM/i); // tolerates a leading upload prefix
  return m ? { so: m[1], item: m[2] } : null;
}

/**
 * Parse a Siemens "BOM" CSV (columns: SO, ITEM, POS, BOM_LEVEL, ITEM_NR, PN,
 * PN_DESCR, ITEM_CATEGORY, QUANTITY, UNIT, ...).
 *
 * Rules (all verified against a real kit):
 *  - Nesting comes from BOM_LEVEL (".1", "..2", "...3").
 *  - A component's QUANTITY is per ONE parent, so the real total is the
 *    quantity multiplied through every ancestor assembly counted in "EA".
 *  - Only bottom-level lines (no children) are candidates for the kit. Of
 *    those: a purchased part is a real description counted in "EA"; raw stock
 *    (sheet steel by the pound, duct by the foot), operations (category "D":
 *    a Loctite application, a machining step) and text rows are not.
 *  - Identical part numbers appearing in several sub-assemblies are merged
 *    into one line with the total quantity and a breakdown of where it goes.
 */
export function parseBom(csvText, { fileName = "" } = {}) {
  const table = parseCsv(csvText, detectDelimiter(csvText));
  if (table.length < 2) throw new Error("The BOM file is empty.");
  const header = table[0].map((h) => h.trim().toUpperCase());
  // Siemens has more than one BOM layout. The same field can be called
  // BOM_LEVEL or Level, PN or MM, PN_DESCR or MM_DESCR, ITEM_CATEGORY or
  // ItemCat, QUANTITY or Q. Each name below is looked up through its aliases.
  const ALIASES = {
    BOM_LEVEL: ["BOM_LEVEL", "LEVEL"],
    PN: ["PN", "MM", "MATERIAL"],
    PN_DESCR: ["PN_DESCR", "MM_DESCR", "DESCRIPTION"],
    QUANTITY: ["QUANTITY", "Q", "QTY"],
    UNIT: ["UNIT", "UOM"],
    ITEM_CATEGORY: ["ITEM_CATEGORY", "ITEMCAT"],
  };
  const colIdx = {};
  const col = (name) => {
    if (!(name in colIdx)) colIdx[name] = (ALIASES[name] || [name]).map((a) => header.indexOf(a)).find((i) => i >= 0) ?? -1;
    return colIdx[name];
  };
  for (const need of ["BOM_LEVEL", "PN", "PN_DESCR", "QUANTITY", "UNIT"]) {
    if (col(need) < 0) {
      throw new Error(
        `This doesn't look like a Siemens BOM — no ${ALIASES[need].join(" / ")} column (found: ${header.filter(Boolean).slice(0, 12).join(", ") || "nothing"}).`
      );
    }
  }
  const cell = (r, name) => (col(name) >= 0 ? String(r[col(name)] ?? "").trim() : "");
  // Some layouts carry no SO / ITEM columns; the sales order and item are then
  // in the file name: "75018093_170_BOM_P3R72481361838C.csv".
  const fromName = parseBomFileName(fileName);

  const rows = table.slice(1).map((r, i) => {
    const level = cell(r, "BOM_LEVEL");
    const dots = (level.match(/\./g) || []).length;
    const trailing = parseInt(level.replace(/\./g, ""), 10);
    const qty = parseFloat(cell(r, "QUANTITY"));
    return {
      idx: i,
      so: cell(r, "SO"),
      item: cell(r, "ITEM"),
      pos: cell(r, "POS"),
      level,
      itemNr: cell(r, "ITEM_NR"),
      qtyText: cell(r, "QUANTITY"),
      depth: dots || (Number.isFinite(trailing) ? trailing : 1),
      pnRaw: cell(r, "PN"),
      pn: cleanPn(cell(r, "PN")),
      desc: cleanPn(cell(r, "PN_DESCR")),
      category: cell(r, "ITEM_CATEGORY").toUpperCase(),
      qty: Number.isFinite(qty) ? qty : 0,
      unit: cell(r, "UNIT").toUpperCase(),
    };
  });

  // Parent links + exploded quantities.
  const stack = [];
  rows.forEach((row) => {
    stack.length = row.depth;
    row.parent = stack[row.depth - 1] || null;
    stack[row.depth] = row;
    const parentFactor = row.parent ? row.parent.factor : 1;
    row.expQty = row.qty * parentFactor;
    row.factor = parentFactor * (row.unit === "EA" && row.qty > 0 ? row.qty : 1);
  });
  rows.forEach((row, i) => {
    const next = rows[i + 1];
    row.isLeaf = !next || next.depth <= row.depth;
    row.isNote = row.category === "T" || !row.desc;
  });

  const top = rows.find((r) => r.depth === 1 && !r.isNote) || rows.find((r) => !r.isNote) || rows[0];
  const meta = {
    so: top?.so || rows[0]?.so || fromName?.so || "",
    item: top?.item || rows[0]?.item || fromName?.item || "",
    topPn: top?.pn || "",
    topDescription: top?.desc || "",
    rowCount: rows.length,
  };

  // Where a line goes: the level-2 assembly it sits under.
  const groupOf = (row) => {
    if (row.depth <= 2) return "Loose parts";
    let p = row;
    while (p && p.depth > 2) p = p.parent;
    return p?.desc || "Loose parts";
  };

  // Walk once, merging identical parts, attaching reference marks, and
  // collecting real instructions.
  const merged = new Map();
  const notes = [];
  let pendingNote = null; // merging a sentence split across rows
  const flushNote = () => {
    if (pendingNote) notes.push(pendingNote);
    pendingNote = null;
  };

  rows.forEach((row, i) => {
    if (row.isNote) {
      const prev = rows[i - 1];
      const ref = designatorText(row.pnRaw);
      if (ref && prev && !prev.isNote) {
        // The mark names the thing printed just above it. When that is a single
        // part it labels that part. When the mark sits at a shallower level than
        // the part above it (it follows an assembly's children), it names the
        // whole assembly, so every part under that assembly gets the mark.
        let target = prev;
        if (row.depth < prev.depth) {
          let j = i - 1;
          while (j >= 0 && !(rows[j].depth === row.depth && !rows[j].isNote)) j--;
          if (j >= 0) target = rows[j];
        }
        const targets = [];
        if (target.isLeaf) targets.push(target);
        else {
          for (let k = target.idx + 1; k < rows.length && rows[k].depth > target.depth; k++) if (!rows[k].isNote && rows[k].isLeaf) targets.push(rows[k]);
        }
        let attached = 0;
        for (const t of targets) {
          if (!t.desc || t.unit !== "EA") continue;
          const line = merged.get(`${t.pn}||${t.unit}`);
          if (!line) continue;
          if (!line.refs.includes(ref)) line.refs.push(ref);
          attached += 1;
        }
        if (attached) return;
      }
      const text = noteText(row.pnRaw);
      if (!text || /no picture/i.test(text)) {
        flushNote();
        return;
      }
      if (isDecorated(row.pnRaw)) {
        flushNote();
        notes.push(text);
        return;
      }
      // Plain text rows continue one sentence until a row ends with a period.
      pendingNote = pendingNote ? `${pendingNote} ${text}` : text;
      if (/\.$/.test(text)) flushNote();
      return;
    }
    flushNote();
    if (!row.isLeaf) return; // assemblies are built from their children
    let kind = "raw";
    if (row.unit === "EA") kind = "part"; // includes category "D" rows that are real parts
    const key = `${row.pn}||${row.unit}`;
    let line = merged.get(key);
    if (!line) {
      line = {
        pn: row.pn,
        description: row.desc,
        unit: row.unit || "EA",
        kind,
        qtyRequired: 0,
        groups: new Map(),
        refs: [],
        bomLineCount: 0,
        sortOrder: merged.size,
      };
      merged.set(key, line);
    }
    line.qtyRequired += row.expQty;
    line.bomLineCount += 1;
    const g = groupOf(row);
    line.groups.set(g, (line.groups.get(g) || 0) + row.expQty);
  });
  flushNote();

  const lines = [...merged.values()].map((l) => ({
    pn: l.pn,
    description: l.description,
    unit: l.unit,
    kind: l.kind,
    qtyRequired: Math.round(l.qtyRequired * 1000) / 1000,
    usedIn: [...l.groups.entries()].map(([g, q]) => `${g} ×${formatQty(q)}`).join(" · "),
    refs: l.refs.join(" · "),
    bomLineCount: l.bomLineCount,
    sortOrder: l.sortOrder,
    included: l.kind === "part",
  }));

  const partLines = lines.filter((l) => l.kind === "part");
  return {
    meta,
    lines,
    notes,
    // The BOM exactly as Siemens printed it (every row, original order), with
    // the flags needed to mark it up. Used for the marked-up BOM printout.
    rows: rows.map((r) => ({
      idx: r.idx,
      pos: r.pos,
      level: r.level,
      itemNr: r.itemNr,
      pn: r.pnRaw,
      desc: r.desc,
      category: r.category,
      qty: r.qtyText,
      unit: r.unit,
      expQty: r.expQty,
      isLeaf: r.isLeaf,
      isNote: r.isNote,
    })),
    stats: {
      bomRows: rows.length,
      assemblies: rows.filter((r) => !r.isNote && !r.isLeaf).length,
      noteRows: rows.filter((r) => r.isNote).length,
      partBomLines: partLines.reduce((s, l) => s + l.bomLineCount, 0),
      partLines: partLines.length,
      partPieces: partLines.reduce((s, l) => s + l.qtyRequired, 0),
      otherLines: lines.length - partLines.length,
    },
  };
}

// ---------------------------------------------------------------------------
// The Siemens zip
// ---------------------------------------------------------------------------

// "SPS21_75024447_20_1101961_INLINE_ELECTRIC_SUPPLY_COMPANY_INC.zip"
//   -> sales order 75024447, item 20, FabTek panel id 1101961, customer text.
export function parseKitZipName(fileName) {
  const base = String(fileName ?? "").split(/[\\/]/).pop().replace(/\.zip$/i, "");
  const m = base.match(/^[A-Za-z]+\d*_(\d+)_(\d+)_(\d+)(?:_(.+))?$/);
  if (!m) return null;
  return { so: m[1], item: m[2], panelId: m[3], customer: (m[4] || "").replace(/_/g, " ") };
}

// What each file in an upload is. In a zip, junk (Thumbs.db, plot logs, macOS
// resource forks, Office lock files) is ignored and only well-known document
// types are kept as "other"; a loose file the person picked on purpose is kept
// whatever it is (`keepUnknown`).
const KEEP_OTHER_EXT = new Set(["doc", "docx", "xlsm", "txt", "png", "jpg", "jpeg", "dwg", "step", "stp", "ppt", "pptx"]);
export function classifyZipEntry(path, { keepUnknown = false } = {}) {
  const name = String(path ?? "").split(/[\\/]/).pop();
  if (!name || name.startsWith(".") || name.startsWith("~$") || /^(thumbs\.db|desktop\.ini)$/i.test(name)) return "ignore";
  if (/(^|\/)__MACOSX\//.test(path)) return "ignore";
  const ext = (name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  if (ext === "csv" || ext === "tsv") return "bom";
  if (ext === "pdf") return "drawing";
  if (ext === "dxf") return "dxf"; // converted to a PDF drawing when the upload is read (see kitZip.js)
  if (ext === "xlsx" || ext === "xls") return "wirelist";
  if (keepUnknown || KEEP_OTHER_EXT.has(ext)) return "other";
  return "ignore";
}

// Drawings in reading order: the main assembly's sheets first (1, 2, 3 ...),
// then any other drawings (sub-assemblies) by number. Names look like
// "72481426479-Model.pdf" (sheet 1), "72481426479_2-Model.pdf" (sheet 2).
export function sortDrawingFiles(fileNames, topDescription = "") {
  const mainDigits = (String(topDescription).match(/(\d{2}-\d{3}-\d{3}-\d{3})/) || [])[1]?.replace(/-/g, "") || "";
  const key = (n) => {
    const m = n.match(/^(\d+)(?:_(\d+))?/);
    const number = m ? m[1] : n;
    const sheet = m && m[2] ? parseInt(m[2], 10) : 1;
    return { number, sheet, main: mainDigits && number === mainDigits ? 0 : 1 };
  };
  return [...fileNames].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka.main - kb.main || ka.number.localeCompare(kb.number) || ka.sheet - kb.sheet || a.localeCompare(b);
  });
}

export function drawingLabel(fileName, topDescription = "") {
  const base = String(fileName).replace(/\.pdf$/i, "").replace(/-Model$/i, "");
  const m = base.match(/^(\d+)(?:_(\d+))?$/);
  if (!m) return base;
  const mainDigits = (String(topDescription).match(/(\d{2}-\d{3}-\d{3}-\d{3})/) || [])[1]?.replace(/-/g, "") || "";
  const sheet = m[2] ? parseInt(m[2], 10) : 1;
  const dash = m[1].replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1-$2-$3-$4");
  return mainDigits && m[1] !== mainDigits ? `${dash} (sub-assembly)` : `${dash} · sheet ${sheet}`;
}

// Panel builds a kit could belong to. A panel id can have several builds
// (a repeat order) or unit suffixes (1101960-1, 1101960-2 for a quantity-2
// line); newest first. `panels` use the app's shape: { id, buildId, dateAdded }.
export function findPanelsForKit(panels, panelId) {
  const want = String(panelId ?? "").trim();
  if (!want) return [];
  return panels
    .filter((p) => p.id === want || String(p.id).startsWith(`${want}-`))
    .sort((a, b) => String(b.dateAdded || "").localeCompare(String(a.dateAdded || "")) || String(a.id).localeCompare(String(b.id)));
}

// ---------------------------------------------------------------------------
// Picking the panels a kit belongs to
// ---------------------------------------------------------------------------

// A job's RFQ number: "1101721-3" (unit 3 of a multi-unit job) -> "1101721".
export const rfqOf = (panel) => (panel.unitCount ? String(panel.id).replace(/-\d+$/, "") : String(panel.id));

/**
 * One group per RFQ, each with its unit panels in order — the list the person
 * flips through when tagging a kit ("1101721 EQISALES · 4 units"). `panels`
 * should already be one build per panel id. Newest jobs first.
 */
export function groupPanelsByRfq(panels) {
  const groups = new Map();
  for (const p of panels) {
    const rfq = rfqOf(p);
    if (!groups.has(rfq)) groups.set(rfq, { rfq, units: [] });
    groups.get(rfq).units.push(p);
  }
  const out = [...groups.values()].map((g) => {
    g.units.sort((a, b) => (a.unitIndex ?? 0) - (b.unitIndex ?? 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    const first = g.units[0];
    return {
      rfq: g.rfq,
      customer: first.customer || "",
      jobNumber: first.jobNumber || "",
      dateAdded: g.units.reduce((m, u) => (String(u.dateAdded || "") > m ? String(u.dateAdded || "") : m), ""),
      units: g.units,
    };
  });
  return out.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.rfq.localeCompare(a.rfq, undefined, { numeric: true }));
}

/**
 * Which RFQs this kit most likely belongs to, so they come ticked and on top:
 * the RFQ in the zip's file name, plus any panel that already has a kit with
 * the same Siemens sales order + item (a re-sent BOM for the same job).
 */
export function suggestRfqs({ nameInfo, meta, kits, panels }) {
  const out = new Set();
  if (nameInfo?.panelId) findPanelsForKit(panels, nameInfo.panelId).forEach((p) => out.add(rfqOf(p)));
  if (meta?.so) {
    const byBuild = new Map(panels.map((p) => [p.buildId, p]));
    for (const k of kits) {
      if (k.soNumber === meta.so && String(k.itemNumber) === String(meta.item)) {
        const p = byBuild.get(k.buildId);
        if (p) out.add(rfqOf(p));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Checking, receiving, undoing — all pure "line in -> line out"
// ---------------------------------------------------------------------------

const LINE_FIELDS = ["status", "qtyReceived", "checkedBy", "checkedAt", "receivedAt"];
export const snapshotLine = (l) => Object.fromEntries(LINE_FIELDS.map((f) => [f, l[f] ?? null]));

/**
 * Apply one verifier action to a line. Returns the patch to store, or null if
 * the action doesn't make sense (so the UI can ignore stray clicks).
 *
 *   got      — everything required is here
 *   missing  — qty = how many DID arrive (0 = none; between 0 and required = short)
 *   reset    — back to "not checked" (the click-it-again / mistake fix)
 *   receive  — more of a missing/short line has arrived (qty = how many now)
 */
export function applyAction(line, action, { qty = 0, by = null, at = new Date().toISOString() } = {}) {
  const required = Number(line.qtyRequired) || 0;
  switch (action) {
    case "got":
      return { status: "got", qtyReceived: required, checkedBy: by, checkedAt: at, receivedAt: null };
    case "missing": {
      const have = Math.max(0, Number(qty) || 0);
      if (have >= required && required > 0) return applyAction(line, "got", { by, at });
      return {
        status: have > 0 ? "short" : "missing",
        qtyReceived: have,
        checkedBy: by,
        checkedAt: at,
        receivedAt: null,
      };
    }
    case "reset":
      return { status: "pending", qtyReceived: 0, checkedBy: null, checkedAt: null, receivedAt: null };
    case "receive": {
      if (line.status !== "missing" && line.status !== "short") return null;
      const add = Number(qty) || 0;
      if (add <= 0) return null;
      const total = Math.min(required, Math.round((Number(line.qtyReceived || 0) + add) * 1000) / 1000);
      const complete = total >= required;
      return {
        status: complete ? "received" : "short",
        qtyReceived: total,
        checkedBy: line.checkedBy ?? null,
        checkedAt: line.checkedAt ?? null,
        receivedAt: at,
      };
    }
    default:
      return null;
  }
}

// An event row records what a click changed (and what it was before), which
// is what makes Undo possible. `group` ties bulk actions together so one Undo
// reverts the whole batch.
export function buildEvent(action, before, after, { by = null, qty = null, note = null, group = null } = {}) {
  return {
    action,
    prevStatus: before.status ?? "pending",
    prevQtyReceived: before.qtyReceived ?? 0,
    prevCheckedBy: before.checkedBy ?? null,
    prevCheckedAt: before.checkedAt ?? null,
    prevReceivedAt: before.receivedAt ?? null,
    newStatus: after.status,
    newQtyReceived: after.qtyReceived,
    qty,
    note,
    by,
    group,
  };
}

// Include/exclude events don't change status — they flip `included`.
export function buildIncludeEvent(action, { by = null } = {}) {
  return { action, prevStatus: null, newStatus: null, by };
}

// Report generation and uploads are logged but are never undoable.
export const UNDOABLE_ACTIONS = new Set(["got", "missing", "short", "reset", "receive", "include", "exclude"]);

/**
 * Which events one Undo click reverts: the newest event that hasn't been
 * undone yet, plus everything sharing its bulk group. `events` = event rows
 * for ONE kit. Returns [] when there is nothing to undo.
 */
export function eventsToUndo(events) {
  // Newest first. Events arrive oldest-first, so when two share a timestamp
  // the later one in the list is the newer one.
  const live = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.undoneAt && UNDOABLE_ACTIONS.has(e.action))
    .sort((a, b) => String(b.e.createdAt).localeCompare(String(a.e.createdAt)) || b.i - a.i)
    .map(({ e }) => e);
  if (!live.length) return [];
  const head = live[0];
  if (!head.group) return [head];
  return live.filter((e) => e.group === head.group);
}

// The line fields to restore for an event being undone.
export function undoPatch(event) {
  if (event.action === "include") return { included: false };
  if (event.action === "exclude") return { included: true };
  return {
    status: event.prevStatus ?? "pending",
    qtyReceived: event.prevQtyReceived ?? 0,
    checkedBy: event.prevCheckedBy ?? null,
    checkedAt: event.prevCheckedAt ?? null,
    receivedAt: event.prevReceivedAt ?? null,
  };
}

// Is it still safe to undo this event? Not if someone changed the same line
// after it (their change would be silently overwritten).
export function canUndo(event, line) {
  if (!line) return false;
  if (event.action === "include") return line.included === true;
  if (event.action === "exclude") return line.included === false;
  return line.status === event.newStatus && Number(line.qtyReceived || 0) === Number(event.newQtyReceived || 0);
}

// ---------------------------------------------------------------------------
// Progress and the outstanding list
// ---------------------------------------------------------------------------

export function kitProgress(lines) {
  const inKit = lines.filter((l) => l.included);
  const count = (s) => inKit.filter((l) => l.status === s).length;
  const total = inKit.length;
  const pending = count("pending");
  const outstandingLines = inKit.filter((l) => l.status === "missing" || l.status === "short");
  return {
    total,
    pending,
    got: count("got"),
    missing: count("missing"),
    short: count("short"),
    received: count("received"),
    checked: total - pending,
    pct: total ? Math.round(((total - pending) / total) * 100) : 0,
    verified: total > 0 && pending === 0,
    outstanding: outstandingLines.length,
    outstandingPieces: outstandingLines.reduce((s, l) => s + qtyDiff(l.qtyRequired, l.qtyReceived), 0),
  };
}

export const outstandingLines = (lines) =>
  lines.filter((l) => l.included && (l.status === "missing" || l.status === "short"));

export const qtyShort = (l) => Math.max(0, qtyDiff(l.qtyRequired, l.qtyReceived));

// ---------------------------------------------------------------------------
// The report to Siemens
// ---------------------------------------------------------------------------

/**
 * Everything the PDF / CSV / email text needs, built once so the three
 * outputs can never disagree. Only OUTSTANDING lines (missing or still short)
 * are listed — already-received parts aren't something to chase.
 */
export function buildReportModel({ kit, panel, lines, preparedBy = "", now = new Date() }) {
  const rows = outstandingLines(lines)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      pn: l.pn,
      description: l.description || "",
      unit: l.unit || "EA",
      qtyRequired: l.qtyRequired,
      qtyReceived: l.qtyReceived || 0,
      qtyShort: qtyShort(l),
      status: l.status === "short" ? "Short" : "Missing",
      refs: l.refs || "",
      note: l.note || "",
    }));
  const progress = kitProgress(lines);
  const dwg = (String(kit?.topDescription || "").match(/(\d{2}-\d{3}-\d{3}-\d{3})/) || [])[1] || "";
  return {
    company: "FabTek Industries",
    title: "Missing Parts Report",
    generatedAt: now.toISOString(),
    preparedBy,
    header: {
      so: kit?.soNumber || "",
      item: kit?.itemNumber || "",
      panelId: panel?.id || kit?.panelId || "",
      jobNumber: panel?.jobNumber || "",
      customer: panel?.customer || "",
      topPn: kit?.topPn || "",
      topDescription: kit?.topDescription || "",
      drawingNumber: dwg,
    },
    rows,
    summary: {
      outstandingLines: rows.length,
      outstandingPieces: rows.reduce((s, r) => s + r.qtyShort, 0),
      checkedLines: progress.checked,
      totalLines: progress.total,
      notYetChecked: progress.pending,
    },
  };
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportToCsv(model) {
  const head = ["Sales Order", "Item", "Panel", "Part Number", "Description", "Unit", "Qty Required", "Qty Received", "Qty Short", "Status", "Reference", "Note"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of model.rows) {
    lines.push(
      [
        model.header.so,
        model.header.item,
        model.header.panelId,
        r.pn,
        r.description,
        r.unit,
        formatQty(r.qtyRequired),
        formatQty(r.qtyReceived),
        formatQty(r.qtyShort),
        r.status,
        r.refs,
        r.note,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  // BOM char up front so Excel opens it as UTF-8; CRLF for Windows tools.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const dateStr = (iso) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};
export const reportDateString = dateStr;

export function reportToEmail(model) {
  const h = model.header;
  const what = [h.so && `SO ${h.so}`, h.item && `Item ${h.item}`].filter(Boolean).join(", ");
  const subject = `Missing parts${what ? ` — ${what}` : ""}${h.drawingNumber ? ` (${h.drawingNumber})` : ""}`;
  const out = [];
  out.push("Hello,");
  out.push("");
  out.push(
    `During pack-out verification on ${dateStr(model.generatedAt)}${what ? ` of ${what}` : ""}${
      h.topPn ? ` (${h.topPn}${h.topDescription ? `, ${h.topDescription}` : ""})` : ""
    }, we found the following parts missing or short:`
  );
  out.push("");
  model.rows.forEach((r, i) => {
    const qty =
      r.status === "Missing"
        ? `need ${formatQty(r.qtyRequired)} ${r.unit}, received none`
        : `need ${formatQty(r.qtyRequired)} ${r.unit}, received ${formatQty(r.qtyReceived)}, short ${formatQty(r.qtyShort)}`;
    out.push(`${String(i + 1).padStart(2, " ")}. ${r.pn}${r.description ? ` — ${r.description}` : ""}${r.refs ? ` [${r.refs}]` : ""}: ${qty}`);
  });
  out.push("");
  out.push(`That is ${model.summary.outstandingLines} line${model.summary.outstandingLines === 1 ? "" : "s"} and ${formatQty(model.summary.outstandingPieces)} pieces outstanding. Please let us know when these will ship.`);
  out.push("");
  out.push("Thank you,");
  out.push(model.preparedBy ? model.preparedBy : "FabTek Industries");
  if (model.preparedBy) out.push("FabTek Industries");
  return { subject, body: out.join("\n") };
}
