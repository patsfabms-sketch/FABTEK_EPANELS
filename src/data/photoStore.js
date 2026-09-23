// ---------------------------------------------------------------------------
// Storage for employee profile photos — same shared-bucket pattern
// pdfStore.js already uses for estimate PDFs (a Supabase Storage bucket,
// `assemblyos-employee-photos`, public-read), so a photo uploaded from the
// desktop console is visible everywhere, not trapped on one device.
// `employees.photoPath` stores the object's PATH, not a URL — getPhotoUrl
// turns that into the actual public URL to put in an <img src>.
// ---------------------------------------------------------------------------

import { supabase, PHOTO_BUCKET } from "../lib/supabaseClient";

// One object path per upload (not reused per employee) so an old photo
// isn't silently overwritten mid-request and so a failed upload can't
// clobber the employee's existing, still-good photo.
export function generatePhotoId(employeeId, file) {
  const ext = (file?.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${employeeId}-${Date.now()}.${ext}`;
}

// Uploads a File/Blob under `id`. Throws on failure — the caller (the Edit
// Profile modal) keeps the modal open and shows an error rather than saving
// a broken/missing photo reference.
export async function savePhotoBlob(id, blob) {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(id, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
}

// Public URL for a stored photo path, or null if there isn't one. The
// bucket is public-read (see the migration), so this is a plain, stable
// link — no signed-URL round trip or expiry to worry about.
export function getPhotoUrl(photoPath) {
  if (!photoPath) return null;
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photoPath);
  return data?.publicUrl ?? null;
}

// Best-effort cleanup of a replaced/removed photo — never throws. An
// orphaned old photo left in storage costs a little space, not correctness,
// so a delete failure here shouldn't block or roll back the profile save
// that already succeeded.
export async function deletePhotoBlob(photoPath) {
  if (!photoPath) return;
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]);
  } catch {
    // ignored — see comment above
  }
}
