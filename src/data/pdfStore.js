// ---------------------------------------------------------------------------
// Storage for uploaded estimate PDFs.
//
// These used to be embedded as base64 data URLs directly inside the panel
// records saved to localStorage. That silently broke in practice:
// localStorage tops out around 5-10MB total per origin, a real scanned/saved
// PDF can easily be several hundred KB to a few MB once base64-inflated, and
// every line-item panel parsed off the same PDF was storing its OWN full
// duplicate copy of it. A handful of imports was enough to blow the quota —
// and the write failure was swallowed by a try/catch (see AppContext's
// persistence effect), so nothing ever told anyone it stopped saving.
//
// IndexedDB has no such practical ceiling (browsers grant it a share of
// disk, typically gigabytes) and stores Blobs natively, so the PDF itself
// lives here, keyed by a generated id — panels just carry that id
// (`pdfId`), and every panel parsed from the same uploaded file shares the
// SAME id rather than duplicating the file per panel.
// ---------------------------------------------------------------------------

const DB_NAME = "assemblyos-files";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function generatePdfId() {
  return `pdf-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

// Saves a File/Blob under `id`. Throws on failure (caller decides how to
// degrade — see estimateImport's parseEstimateFile, which lets the import
// proceed without a viewable PDF rather than failing the whole import).
export function savePdfBlob(id, blob) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

// Returns the stored Blob for `id`, or null if missing/unavailable. Never
// throws — a panel whose PDF can't be found should show "couldn't open",
// not crash the detail view.
export async function getPdfBlob(id) {
  if (!id) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
