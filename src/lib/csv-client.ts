/**
 * Client-side CSV download for panel lists (§4.2 "CSV export on every table").
 * Escapes formula injection the same way the server-side ops export does.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@") ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
