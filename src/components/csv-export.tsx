"use client";

/**
 * Tiny client helper that turns an array of rows into a CSV file and
 * triggers a browser download. No deps; works in all modern browsers.
 */
function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function CsvExportLink({
  filename,
  rows,
  className,
  children = "Export CSV",
}: {
  filename: string;
  rows: (string | number | null | undefined)[][];
  className?: string;
  children?: React.ReactNode;
}) {
  function onClick() {
    const body = rows.map((r) => r.map(escapeCell).join(",")).join("\n");
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
