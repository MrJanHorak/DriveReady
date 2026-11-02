export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

// Keep oversized exports available for recovery, but let the caller warn that
// the current restore screen cannot open them.
export function downloadFamilyBackup(family, filename) {
  const blob = new Blob([JSON.stringify(family, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return blob.size;
}
