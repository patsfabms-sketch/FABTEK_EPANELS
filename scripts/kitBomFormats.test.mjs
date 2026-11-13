// Checks the second Siemens BOM layout (tab-separated; columns POS, Level,
// ITEM_NR, MM, MM_DESCR, DG, ItemCat, Q, UNIT, STOCK; no SO/ITEM columns) and
// the comma layout still agree. Run: node scripts/kitBomFormats.test.mjs
import assert from "node:assert/strict";
import { detectDelimiter, parseBom, parseBomFileName } from "../src/data/kitData.js";

const T = (rows) => rows.map((r) => r.join("\t")).join("\r\n") + "\r\n";
const header = ["POS", "Level", "ITEM_NR", "MM", "MM_DESCR", "DG", "ItemCat", "Q", "UNIT", "STOCK"];
const row = (pos, level, item, mm, descr, cat, q, unit) => [pos, level, item, mm, descr, "", cat, q, unit, ""];
const tsv = T([
  header,
  row(0, "0.1", 1, "******* XCEL ENERGY *******", "", "T", 1, "EA"),
  row(1, "0.1", 4100, "P3R72481361838C", '"CONTROL PANEL, 72-481-361-438"', "L", 1, "EA"),
  row(2, "..2", 4705, "P3R72184282520", '"DIN RELAY MTG ASSY"', "L", 2, "EA"),
  row(3, "...3", 2, "P3RW 680190", '"OCTAL SOCKET, 8 PIN"', "L", 2, "EA"),
  row(4, "...3", 3, "P3RW 528508", "RELAY", "L", 2, "EA"),
  row(5, "...3", 4, "P3RW 684435", '"WIRING DUCT & COVERS"', "L", 3.5, "FT"),
  row(6, "..2", 4706, "***** 27M, 27HT RELAY *****", "", "T", 1, "EA"),
  row(7, "..2", 4710, "P3RW 470057", '"RECEPTACLE, DUP 125V 20A"', "L", 1, "EA"),
  row(8, "..2", 4711, "****** RCP2******", "", "T", 1, "EA"),
  row(9, "..2", 4800, "P3RW 1", '"DUCT 2.5"" X 4.0"""', "L", 3, "EA"),
]);
assert.equal(detectDelimiter(tsv), "\t");
assert.equal(detectDelimiter("SO, ITEM, POS\r\n1,2,3"), ",");
assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
assert.equal(detectDelimiter('"a,b"\tc\td'), "\t"); // comma inside quotes doesn't count

const r = parseBom(tsv, { fileName: "1794591804177_75018093_170_BOM_P3R72481361838C.csv" });
assert.equal(r.meta.so, "75018093");
assert.equal(r.meta.item, "170");
assert.equal(r.meta.topPn, "P3R72481361838C");
assert.equal(r.meta.topDescription, "CONTROL PANEL, 72-481-361-438");
const line = (pn) => r.lines.find((l) => l.pn === pn);
assert.equal(line("P3RW 680190").qtyRequired, 4); // 2 relays x 2 sockets
assert.equal(line("P3RW 528508").qtyRequired, 4);
assert.equal(line("P3RW 684435").included, false); // by the foot = raw stock
assert.equal(line("P3RW 1").description, 'DUCT 2.5" X 4.0"'); // doubled quotes
// a mark that follows an assembly's children labels the whole assembly...
assert.equal(line("P3RW 680190").refs, "27M, 27HT RELAY");
assert.equal(line("P3RW 528508").refs, "27M, 27HT RELAY");
// ...and one that follows a single part labels that part only.
assert.equal(line("P3RW 470057").refs, "RCP2");
assert.equal(line("P3RW 1").refs, "");
assert.deepEqual(r.notes, ["XCEL ENERGY"]);

// SO/item columns, when present, win over the file name; comma layout unchanged
const csv = "SO, ITEM, POS, BOM_LEVEL, ITEM_NR, PN, PN_DESCR, ITEM_CATEGORY, QUANTITY, UNIT\r\n9, 8, 1, .1, 1, TOP, A TOP, L, 1, EA\r\n9, 8, 2, ..2, 1, P1, PART, L, 3, EA\r\n";
const c = parseBom(csv, { fileName: "75018093_170_BOM_X.csv" });
assert.equal(c.meta.so, "9");
assert.equal(c.meta.item, "8");
assert.equal(c.lines.find((l) => l.pn === "P1").qtyRequired, 3);

assert.deepEqual(parseBomFileName("x/75018093_170_BOM_P3R72481361838C.csv"), { so: "75018093", item: "170" });
assert.deepEqual(parseBomFileName("1794591804177_75018093_170_BOM_P3R.csv"), { so: "75018093", item: "170" }); // a leading upload prefix is skipped
assert.equal(parseBomFileName("BOM.csv"), null);
assert.throws(() => parseBom("A\tB\r\n1\t2\r\n"), /doesn't look like a Siemens BOM — no BOM_LEVEL \/ LEVEL column \(found: A, B\)/);
console.log("BOM FORMATS OK");
