// Run: node scripts/dxfConvert.test.mjs <sample.dxf> <out.pdf>
import fs from "node:fs";
import assert from "node:assert/strict";
import { dxfToPdf, cleanDxfText, paperColor } from "../src/data/kitDxf.js";

assert.equal(cleanDxfText("DISC SW 1\\PQTY 4"), "DISC SW 1\nQTY 4");
assert.equal(cleanDxfText("{\\fArial|b0;HELLO} %%c12 %%d"), "HELLO Ø12 °");
assert.equal(cleanDxfText("\\H2.5;BIG"), "BIG");
assert.deepEqual(paperColor([255, 255, 255]), [0, 0, 0]);
assert.deepEqual(paperColor([255, 0, 0]), [255, 0, 0]);
await assert.rejects(() => dxfToPdf("not a dxf"), /doesn't look like a text DXF/);
await assert.rejects(() => dxfToPdf("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"), /no visible lines or text/);

const [src, out] = process.argv.slice(2);
if (src) {
  const { blob, stats } = await dxfToPdf(fs.readFileSync(src, "utf8"), { title: "sample" });
  fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
  console.log("stats", stats);
  assert.ok(stats.lines >= 15 && stats.labels >= 7, JSON.stringify(stats));
}
console.log("DXF assertions OK");
