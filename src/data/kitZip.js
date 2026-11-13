// Reads a Siemens kit zip in the browser: finds the BOM, drawings and wire
// list, parses the BOM, and hands back what the upload dialog needs. Nothing
// is executed or uploaded here — this is read-only inspection of the zip.

import JSZip from "jszip";
import { classifyZipEntry, parseBom, parseKitZipName, sortDrawingFiles } from "./kitData";
import { dxfToPdf } from "./kitDxf";

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
  const dxfEntries = entries.filter((e) => classifyZipEntry(e.name) === "dxf");

  // Any DXF drawing is converted to a PDF right here so it shows up in the Prints
  // tab like every other drawing (zoom, pins and all). If the zip already has a
  // PDF with the same name, that PDF is used and the DXF isn't converted again.
  // The original DXF is always kept with the kit's files for download. A DXF that
  // can't be converted is reported in `warnings` and doesn't stop the upload.
  const pdfNames = new Set(drawingEntries.map((e) => base(e).toLowerCase()));
  const converted = [];
  const warnings = [];
  const convertedPdfs = new Map(); // pdf name -> blob
  const dxfOriginals = [];
  for (const e of dxfEntries) {
    const name = base(e);
    const pdfName = name.replace(/\.dxf$/i, ".pdf");
    if (e._data && e._data.uncompressedSize > MAX_ENTRY_BYTES) {
      warnings.push(`${name} is too large to convert here — it was kept for download but isn't in Prints.`);
      continue;
    }
    const text = await e.async("string");
    dxfOriginals.push({ name, blob: new Blob([text], { type: "application/dxf" }) });
    if (pdfNames.has(pdfName.toLowerCase())) continue; // the zip already includes this drawing as a PDF
    try {
      const { blob } = await dxfToPdf(text, { title: pdfName });
      convertedPdfs.set(pdfName, blob);
      converted.push({ from: name, to: pdfName });
    } catch (err) {
      warnings.push(`${name} couldn't be converted to PDF (${err.message}) — it was kept for download but isn't in Prints.`);
    }
  }

  const order = sortDrawingFiles([...drawingEntries.map(base), ...convertedPdfs.keys()], parsed.meta.topDescription);
  for (const n of order) {
    if (convertedPdfs.has(n)) {
      files.push({ kind: "drawing", fileName: n, blob: convertedPdfs.get(n), contentType: "application/pdf" });
      continue;
    }
    const e = drawingEntries.find((x) => base(x) === n);
    if (e._data && e._data.uncompressedSize > MAX_ENTRY_BYTES) continue;
    const buf = await e.async("arraybuffer");
    files.push({ kind: "drawing", fileName: n, blob: new Blob([buf], { type: "application/pdf" }), contentType: "application/pdf" });
  }
  for (const d of dxfOriginals) {
    files.push({ kind: "other", fileName: d.name, blob: d.blob, contentType: "application/dxf" });
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
  return { nameInfo, parsed, files, sourceFileName: file.name, bomFileName: base(bomEntry), converted, warnings };
}
