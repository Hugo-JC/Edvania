export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, "\"\"")}"`;
  }
  return formulaSafe;
}

export function buildCsvDocument(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function parseDateRangeFilters(fromParam?: string | null, toParam?: string | null): {
  fromDate: string;
  toDate: string;
  fromIso: string | null;
  toIso: string | null;
} {
  const datePattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const fromDate = fromParam && datePattern.test(fromParam) ? fromParam : "";
  const toDate = toParam && datePattern.test(toParam) ? toParam : "";
  return {
    fromDate,
    toDate,
    fromIso: fromDate ? `${fromDate}T00:00:00.000Z` : null,
    toIso: toDate ? `${toDate}T23:59:59.999Z` : null,
  };
}
