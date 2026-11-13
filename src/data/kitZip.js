// Reads what Siemens sends for a kit — a .zip, or loose files (BOM .csv,
// drawing PDFs/DXFs, wire-list Excel, anything else) — in the browser: finds
// the BOM, drawings and wire list, parses the BOM, and hands back what the
// upload dialog needs. Nothing is executed or uploaded here — this is
// read-only inspection.

import JSZip from "jszip";
import { classifyZipEntry, parseBom, parseKitZipName, sortDrawingFiles } from "./kitData";
import { dxfToPdf } from "./kitDxf";

const MAX_ENTRY_BYTES = 60 * 1024 * 1024;

const MIME = {
  csv: "text/csv",
  pdf: "application/pdf",
  dxf: "application/dxf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
const mimeFor = (name) => MIME[(String(name).match(/\.([^.]+)$/) || [])[1]?.toLowerCase()] || "application/octet-stream";

// CSV bytes -> text. Handles UTF-8 (with or without a BOM mark) and the UTF-16
// that Excel's "Unicode Text" export produces.
function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

const baseName = (e) => e.name.split(/[\\/]/).pop();
const isHuge = (e) => e._data && e._data.uncompressedSize > MAX_ENTRY_BYTES;

// A loose file the user picked, wrapped so it looks like a zip entry. Files
// picked on purpose are kept whatever their type (`keepUnknown`).
function fileEntry(file) {
  return {
    name: file.name,
    keepUnknown: true,
    _data: { uncompressedSize: file.size },
    async: async (type) => (type === "string" ? file.text() : type === "arraybuffer" ? file.arrayBuffer() : file),
  };
}

const classify = (e, bomAsOther) => {
  const k = classifyZipEntry(e.name, { keepUnknown: !!e.keepUnknown });
  return bomAsOther && k === "bom" ? "other" : k;
};

// Every entry of one or more uploads: zips are opened, loose files are used as
// they are. Hidden / junk entries are dropped later by classifyZipEntry.
export async function expandUploads(fileList) {
  const out = [];
  for (const f of [...fileList]) {
    if (/\.zip$/i.test(f.name)) {
      const zip = await JSZip.loadAsync(f);
      out.push(...Object.values(zip.files).filter((e) => !e.dir));
    } else {
      out.push(fileEntry(f));
    }
  }
  return out;
}

/**
 * Turn entries into the files a kit keeps: drawings (PDFs, plus DXFs converted
 * to PDF), wire lists (Excel), and everything else as "other". `skipEntry` is
 * the BOM when one is being parsed separately. Returns { files, converted,
 * warnings } — a DXF that can't be converted never stops the upload.
 */
async function collectFiles(entries, { skipEntry = null, topDescription = "", bomAsOther = false } = {}) {
  const live = entries.filter((e) => e !== skipEntry);
  const kind = (e) => classify(e, bomAsOther);
  const files = [];
  const converted = [];
  const warnings = [];

  const drawingEntries = live.filter((e) => kind(e) === "drawing");
  const dxfEntries = live.filter((e) => kind(e) === "dxf");

  // Any DXF drawing is converted to a PDF right here so it shows up in the Prints
  // tab like every other drawing (zoom, pins and all). If the upload already has a
  // PDF with the same name, that PDF is used and the DXF isn't converted again.
  // The original DXF is always kept with the kit's files for download.
  const pdfNames = new Set(drawingEntries.map((e) => baseName(e).toLowerCase()));
  const convertedPdfs = new Map(); // pdf name -> blob
  const dxfOriginals = [];
  for (const e of dxfEntries) {
    const name = baseName(e);
    const pdfName = name.replace(/\.dxf$/i, ".pdf");
    if (isHuge(e)) {
      warnings.push(`${name} is too large to convert here — it was kept for download but isn't in Prints.`);
      continue;
    }
    const text = await e.async("string");
    dxfOriginals.push({ name, blob: new Blob([text], { type: "application/dxf" }) });
    if (pdfNames.has(pdfName.toLowerCase())) continue;
    try {
      const { blob } = await dxfToPdf(text, { title: pdfName });
      convertedPdfs.set(pdfName, blob);
      converted.push({ from: name, to: pdfName });
    } catch (err) {
      warnings.push(`${name} couldn't be converted to PDF (${err.message}) — it was kept for download but isn't in Prints.`);
    }
  }

  const order = sortDrawingFiles([...drawingEntries.map(baseName), ...convertedPdfs.keys()], topDescription);
  for (const n of order) {
    if (convertedPdfs.has(n)) {
      files.push({ kind: "drawing", fileName: n, blob: convertedPdfs.get(n), contentType: "application/pdf" });
      continue;
    }
    const e = drawingEntries.find((x) => baseName(x) === n);
    if (isHuge(e)) {
      warnings.push(`${n} is too large to keep here (over 60 MB) and was skipped.`);
      continue;
    }
    const buf = await e.async("arraybuffer");
    files.push({ kind: "drawing", fileName: n, blob: new Blob([buf], { type: "application/pdf" }), contentType: "application/pdf" });
  }
  for (const d of dxfOriginals) {
    files.push({ kind: "other", fileName: d.name, blob: d.blob, contentType: "application/dxf" });
  }
  for (const kd of ["wirelist", "other"]) {
    for (const e of live.filter((x) => kind(x) === kd)) {
      const name = baseName(e);
      if (isHuge(e)) {
        warnings.push(`${name} is too large to keep here (over 60 MB) and was skipped.`);
        continue;
      }
      const type = mimeFor(name);
      const buf = await e.async("arraybuffer");
      files.push({ kind: kd, fileName: name, blob: new Blob([buf], { type }), contentType: type });
    }
  }
  return { files, converted, warnings };
}

async function readKitEntries(entries, sourceFileName, nameInfo) {
  const bomEntries = entries.filter((e) => classify(e) === "bom");
  if (!bomEntries.length) {
    throw new Error(
      "No BOM (.csv) file was found. To start a new kit, include Siemens' BOM .csv (or the zip). To add files to a kit that already exists, open the kit and use Add files."
    );
  }
  // Several CSVs? Try the ones with "BOM" in the name first, then the rest, and
  // use the first that really is a Siemens BOM — a stray empty or unrelated CSV
  // in the upload no longer blocks the kit.
  const ordered = [...bomEntries.filter((e) => /bom/i.test(baseName(e))), ...bomEntries.filter((e) => !/bom/i.test(baseName(e)))];
  let bomEntry = null;
  let parsed = null;
  const problems = [];
  for (const e of ordered) {
    try {
      parsed = parseBom(decodeText(await e.async("arraybuffer")), { fileName: baseName(e) });
      bomEntry = e;
      break;
    } catch (err) {
      problems.push(`${baseName(e)}: ${err.message}`);
    }
  }
  if (!bomEntry) {
    throw new Error(
      `Couldn't find a usable BOM in this upload. ${problems.join(" ")} Check that Siemens' BOM .csv has parts listed in it (open it in Excel), or send it to Pat/Claude to look at.`
    );
  }

  const bomBlob = await bomEntry.async("blob");
  const rest = await collectFiles(entries, { skipEntry: bomEntry, topDescription: parsed.meta.topDescription, bomAsOther: true });
  const files = [{ kind: "bom", fileName: baseName(bomEntry), blob: bomBlob, contentType: "text/csv" }, ...rest.files];
  return { nameInfo, parsed, files, sourceFileName, bomFileName: baseName(bomEntry), converted: rest.converted, warnings: rest.warnings };
}

// One Siemens zip (the usual case).
export async function readKitZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  return readKitEntries(entries, file.name, parseKitZipName(file.name));
}

// Anything the user picks or drops to start a kit: a zip, or loose files
// (BOM .csv + drawings + Excel + whatever), or several zips.
export async function readKitUpload(fileList) {
  const files = [...fileList];
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) return readKitZip(files[0]);
  const entries = await expandUploads(files);
  const zipName = files.find((f) => /\.zip$/i.test(f.name))?.name;
  const nameInfo = parseKitZipName(zipName || "") || null;
  const label = files.length === 1 ? files[0].name : `${files.length} files (${files.slice(0, 3).map((f) => f.name).join(", ")}${files.length > 3 ? ", …" : ""})`;
  return readKitEntries(entries, label, nameInfo);
}

// Files to attach to a kit that already exists: no new BOM is read, a .csv is
// kept as a plain file, drawings go to Prints, DXFs are converted.
export async function readExtraFiles(fileList, { topDescription = "" } = {}) {
  const entries = await expandUploads(fileList);
  const res = await collectFiles(entries, { topDescription, bomAsOther: true });
  if (!res.files.length && !res.warnings.length) throw new Error("No usable files were found in that selection.");
  return res;
}
