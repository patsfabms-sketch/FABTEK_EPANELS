// ---------------------------------------------------------------------------
// Storage for uploaded estimate PDFs.
//
// These used to live in this browser's IndexedDB, keyed by a generated id —
// which fixed the original localStorage-quota problem but meant a PDF
// uploaded on the desktop console was invisible to a technician's phone,
// since IndexedDB is per-device too. They now live in a Supabase Storage
// bucket (`assemblyos-pdfs`) shared by every device, keyed the same way:
// panels carry a generated id (`pdfId`, now the storage object's path), and
// every panel parsed from the same uploaded file shares the SAME id rather
// than duplicating the file per panel.
// ---------------------------------------------------------------------------

import { supabase, PDF_BUCKET } from "../lib/supabaseClient";

export function generatePdfId() {
  return `pdf-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
}

// Uploads a File/Blob under `id` (the storage object path). Throws on
// failure (caller decides how to degrade — see estimateImport's
// parseEstimateFile, which lets the import proceed without a viewable PDF
// rather than failing the whole import).
export async function savePdfBlob(id, blob) {
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(id, blob, {
    contentType: blob.type || "application/pdf",
    upsert: true,
  });
  if (error) throw error;
}

// Returns the stored Blob for `id`, or null if missing/unavailable. Never
// throws — a panel whose PDF can't be found should show "couldn't open",
// not crash the detail view.
export async function getPdfBlob(id) {
  if (!id) return null;
  try {
    const { data, error } = await supabase.storage.from(PDF_BUCKET).download(id);
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// Public URL for `id` — the bucket is public-read (see the migration), so
// this is a plain, stable link with no signed-URL round trip or expiry.
// Used as a fallback / for direct linking where a same-tab download isn't
// necessary.
export function getPdfPublicUrl(id) {
  if (!id) return null;
  const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(id);
  return data?.publicUrl ?? null;
}
