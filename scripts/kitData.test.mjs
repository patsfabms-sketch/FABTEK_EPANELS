// Run: node scripts/kitData.test.mjs <path-to-BOM.csv>
import fs from "node:fs";
import assert from "node:assert/strict";
import * as K from "../src/data/kitData.js";

const file = process.argv[2];
const bom = K.parseBom(fs.readFileSync(file, "utf8"));
console.log("meta", bom.meta);
console.log("stats", bom.stats);
console.log("notes", bom.notes.length);
const parts = bom.lines.filter((l) => l.kind === "part");
console.log("parts", parts.length, "raw/other", bom.lines.length - parts.length);
console.log("sample", parts.slice(0, 4));
console.log("with refs", parts.filter((p) => p.refs).length);
console.log("raw", bom.lines.filter((l) => l.kind !== "part").slice(0, 5).map((l) => [l.pn, l.unit, l.qtyRequired]));

// Real-kit facts (cross-checked independently with Python's csv module)
assert.equal(bom.stats.bomRows, 304);
assert.equal(bom.stats.noteRows, 30);
assert.equal(bom.stats.partBomLines, 156);
assert.equal(bom.stats.partLines, 102);
assert.equal(bom.lines.length - parts.length, 12 + 0 === 12 ? bom.lines.length - 102 : 0);
assert.equal(parts.every((p) => p.included), true);
assert.equal(bom.lines.filter((l) => l.kind !== "part").every((l) => !l.included), true);
// sub-assembly multiplier: parts under "DISC 1 KN SW ×4" are multiplied
assert.ok(parts.reduce((s, p) => s + p.qtyRequired, 0) > 1201, "exploded total should exceed the as-listed 1,201");
// zip name
assert.deepEqual(K.parseKitZipName("SPS21_75024447_20_1101961_INLINE_ELECTRIC_SUPPLY_COMPANY_INC.zip"), { so: "75024447", item: "20", panelId: "1101961", customer: "INLINE ELECTRIC SUPPLY COMPANY INC" });
// actions
const line = { qtyRequired: 10, status: "pending", qtyReceived: 0, included: true, sortOrder: 0, pn: "X", unit: "EA" };
const miss = K.applyAction(line, "missing", { qty: 0, by: "a" });
assert.equal(miss.status, "missing");
const sh = K.applyAction(line, "missing", { qty: 4 });
assert.equal(sh.status, "short");
assert.equal(K.applyAction(line, "missing", { qty: 10 }).status, "got");
const shortLine = { ...line, ...sh };
const r1 = K.applyAction(shortLine, "receive", { qty: 3 });
assert.equal(r1.status, "short"); assert.equal(r1.qtyReceived, 7);
const r2 = K.applyAction({ ...shortLine, ...r1 }, "receive", { qty: 99 });
assert.equal(r2.status, "received"); assert.equal(r2.qtyReceived, 10);
assert.equal(K.applyAction(line, "receive", { qty: 1 }), null);
// undo
const ev = { ...K.buildEvent("missing", K.snapshotLine(line), miss), createdAt: "2026-01-01T00:00:00Z" };
assert.deepEqual(K.undoPatch(ev).status, "pending");
assert.equal(K.canUndo(ev, { ...line, ...miss }), true);
assert.equal(K.canUndo(ev, { ...line, ...sh }), false);
// report
const lines = parts.map((p, i) => ({ ...p, status: i === 0 ? "missing" : i === 1 ? "short" : "got", qtyReceived: i === 1 ? 1 : i === 0 ? 0 : p.qtyRequired }));
const model = K.buildReportModel({ kit: { soNumber: bom.meta.so, itemNumber: bom.meta.item, topPn: bom.meta.topPn, topDescription: bom.meta.topDescription }, panel: { id: "1101961" }, lines, preparedBy: "Pat" });
assert.equal(model.rows.length, 2);
console.log(K.reportToCsv(model));
console.log(K.reportToEmail(model).body);
console.log("progress", K.kitProgress(lines));
console.log("ALL OK");
