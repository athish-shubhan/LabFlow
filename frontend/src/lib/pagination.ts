/** Page-number items for a pager: first, last, current ±1, with "gap" markers between. */
export function pageItems(current: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 0) return [];
  const pages = new Set([1, totalPages, current - 1, current, current + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push(p - prev === 2 ? prev + 1 : "gap");
    out.push(p);
  }
  return out;
}

/** "Showing 26–50 of 213" range for a page; zero-based guard for empty results. */
export function pageRange(page: number, pageSize: number, total: number): { start: number; end: number } {
  if (total === 0) return { start: 0, end: 0 };
  const start = (page - 1) * pageSize + 1;
  return { start: Math.min(start, total), end: Math.min(page * pageSize, total) };
}

/** Parse a ?page= value into a positive integer, defaulting to 1. */
export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
