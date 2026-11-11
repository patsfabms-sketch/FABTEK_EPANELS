// Reads a Siemens kit zip in the browser: finds the BOM, drawings and wire
// list, parses the BOM, and hands back what the upload dialog needs. Nothing
// is executed or uploaded here — this is read-only inspection of the zip.

import JSZip from "jszip";
import { classifyZipEntry, parseBom, parseKitZipName, sortDrawingFiles } from "./kitData";

const MAX_ENTRY_BYTES = 60 * 1024 * 1024;

export async function readKitZip(file) {
  const nameInfo = parseKitZipName(file.name);
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);

  const bomEntries = entries.filter((e) => classifyZipEntry(e.name) === "bom");
  if (!bomEntries.length) throw new Error("No BOM (.csv) file was found in this zip.");
  // If there are several CSVs, prefer one with "BOM" in its name.
  const bomEntry = bomEntries.find((e) => /bom/i.test(e.name)) || bomEntries[0];
  const parsed = parseBom(await bomEntry.async("string"));

  const base = (e) => e.name.split(/[\\/]/).pop();
  const files = [];
  const bomBlob = await bomEntry.async("blob");
  files.push({ kind: "bom", fileName: base(bomEntry), blob: bomBlob, contentType: "text/csv" });

  const drawingEntries = entries.filter((e) => classifyZipEntry(e.name) === "drawing");
  const order = sortDrawingFiles(drawingEntries.map(base), parsed.meta.topDescription);
  for (const n of order) {
    const e = drawingEntries.find((x) => base(x) === n);
    if (e._data && e._data.uncompressedSize > MAX_ENTRY_BYTES) continue;
    const buf = await e.async("arraybuffer");
    files.push({ kind: "drawing", fileName: n, blob: new Blob([buf], { type: "application/pdf" }), contentType: "application/pdf" });
  }
  for (const e of entries.filter((x) => classifyZipEntry(x.name) === "wirelist")) {
    const buf = await e.async("arraybuffer");
    files.push({
      kind: "wirelist",
      fileName: base(e),
      blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  return { nameInfo, parsed, files, sourceFileName: file.name, bomFileName: base(bomEntry) };
}
