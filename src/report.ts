import { isDropped, markouts, type DropReason, type Fill, type FillMarkouts } from "./markouts.js";
import type { PriceSeries } from "./prices.js";
import { round, weightedStat, type WeightedStat } from "./stats.js";

export const DEFAULT_HORIZONS = [1, 5, 15, 30, 60];
export const SIZE_BUCKETS = [0, 100, 1_000, 10_000, 100_000];

export interface Row {
  venue: string;
  /** "all" or a bucket label like "1k-10k". */
  size: string;
  count: number;
  notional: number;
  effective: WeightedStat;
  markout: Record<number, WeightedStat>;
  impact: Record<number, WeightedStat>;
  realized: Record<number, WeightedStat>;
  /** Notional share of fills where the taker was in profit at the longest horizon. */
  toxicShare: number;
}

export interface Report {
  horizons: number[];
  fills: number;
  used: number;
  dropped: Record<DropReason, number>;
  rows: Row[];
}

export function bucketLabel(notional: number): string {
  const fmt = (x: number) => (x >= 1000 ? `${x / 1000}k` : `${x}`);
  for (let i = SIZE_BUCKETS.length - 1; i >= 0; i--) {
    const lo = SIZE_BUCKETS[i]!;
    if (notional >= lo) {
      const hi = SIZE_BUCKETS[i + 1];
      return hi === undefined ? `${fmt(lo)}+` : `${fmt(lo)}-${fmt(hi)}`;
    }
  }
  return `${fmt(0)}-${fmt(SIZE_BUCKETS[1]!)}`;
}

export function buildReport(fills: Fill[], prices: PriceSeries, horizons = DEFAULT_HORIZONS, maxDeviationBps = 500): Report {
  const dropped: Record<DropReason, number> = { no_price: 0, no_future_price: 0, deviation: 0 };
  const used: FillMarkouts[] = [];
  for (const f of fills) {
    const r = markouts(f, prices, horizons, maxDeviationBps);
    if (isDropped(r)) dropped[r.dropped]++;
    else used.push(r);
  }

  const groups = new Map<string, FillMarkouts[]>();
  const add = (k: string, m: FillMarkouts) => {
    const g = groups.get(k);
    if (g) g.push(m);
    else groups.set(k, [m]);
  };
  for (const m of used) {
    add(`${m.fill.venue}\u0000all`, m);
    add(`${m.fill.venue}\u0000${bucketLabel(m.fill.quote)}`, m);
  }

  const longest = Math.max(...horizons);
  const rows: Row[] = [...groups].map(([key, ms]) => {
    const [venue, size] = key.split("\u0000") as [string, string];
    const w = ms.map((m) => m.fill.quote);
    const notional = w.reduce((a, b) => a + b, 0);
    const per = (pick: (m: FillMarkouts, h: number) => number) =>
      Object.fromEntries(horizons.map((h) => [h, clean(weightedStat(ms.map((m) => pick(m, h)), w))]));
    const toxic = ms.reduce((s, m) => s + (m.horizons[longest]!.markout > 0 ? m.fill.quote : 0), 0);
    return {
      venue,
      size,
      count: ms.length,
      notional: round(notional, 2),
      effective: clean(weightedStat(ms.map((m) => m.effective), w)),
      markout: per((m, h) => m.horizons[h]!.markout),
      impact: per((m, h) => m.horizons[h]!.impact),
      realized: per((m, h) => m.horizons[h]!.realized),
      toxicShare: round(toxic / notional),
    };
  });
  const order = (s: string) => (s === "all" ? -1 : SIZE_BUCKETS.findIndex((b) => s === bucketLabel(b)));
  const venueNotional = new Map(rows.filter((r) => r.size === "all").map((r) => [r.venue, r.notional]));
  rows.sort((a, b) => venueNotional.get(b.venue)! - venueNotional.get(a.venue)! || a.venue.localeCompare(b.venue) || order(a.size) - order(b.size));

  return { horizons, fills: fills.length, used: used.length, dropped, rows };
}

function clean(s: WeightedStat): WeightedStat {
  return { n: s.n, weight: round(s.weight, 2), mean: round(s.mean), stderr: round(s.stderr), lo: round(s.lo), hi: round(s.hi) };
}

const fmtStat = (s: WeightedStat) => (Number.isNaN(s.mean) ? "" : Number.isNaN(s.stderr) ? s.mean.toFixed(2) : `${s.mean.toFixed(2)} ± ${(1.96 * s.stderr).toFixed(2)}`);

/** Markdown tables: one overview, then markouts per horizon. Values are notional weighted bps with 95% intervals. */
export function toMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push(`Fills: ${r.fills}, used: ${r.used}, dropped: ${Object.entries(r.dropped).map(([k, v]) => `${k} ${v}`).join(", ")}`, "");
  const longest = Math.max(...r.horizons);
  lines.push(`| Venue | Size (quote) | Fills | Notional | Effective spread | Taker markout ${longest}s | Realized spread ${longest}s | Toxic share |`);
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const row of r.rows) {
    lines.push(
      `| ${row.venue} | ${row.size} | ${row.count} | ${row.notional.toLocaleString("en-US")} | ${fmtStat(row.effective)} | ${fmtStat(row.markout[longest]!)} | ${fmtStat(row.realized[longest]!)} | ${(row.toxicShare * 100).toFixed(1)}% |`,
    );
  }
  lines.push("", "Taker markout by horizon (all sizes):", "");
  lines.push(`| Venue | ${r.horizons.map((h) => `${h}s`).join(" | ")} |`);
  lines.push(`|---|${r.horizons.map(() => "---:").join("|")}|`);
  for (const row of r.rows.filter((x) => x.size === "all")) {
    lines.push(`| ${row.venue} | ${r.horizons.map((h) => fmtStat(row.markout[h]!)).join(" | ")} |`);
  }
  lines.push("", "All values in bps, notional weighted, ± is a 95% interval. Positive markout = taker gained after the fill.");
  return lines.join("\n");
}
