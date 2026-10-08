import type { PriceSeries } from "./prices.js";

/** One swap seen as a base/quote trade. This is the line format of swaps.jsonl. */
export interface Fill {
  signature: string;
  slot: number;
  txIndex: number;
  blockTime: number;
  venue: string;
  program: string;
  trader: string;
  side: "buy" | "sell";
  /** Base amount, e.g. SOL. */
  base: number;
  /** Quote amount, e.g. USDC. This is the notional. */
  quote: number;
  /** Quote per base. */
  price: number;
}

export interface FillMarkouts {
  fill: Fill;
  /** Mid at the swap's second. */
  mid: number;
  /** Effective spread in bps. Positive = the taker paid over mid. */
  effective: number;
  /** Per horizon in seconds, all in bps. */
  horizons: Record<number, { markout: number; impact: number; realized: number }>;
}

export type DropReason = "no_price" | "no_future_price" | "deviation";

const BPS = 10_000;

/**
 * Markouts for one fill. With side s (+1 buy, -1 sell), price p, mid m0 and later mid mh:
 * effective = s(p - m0)/m0, markout = s(mh - p)/p, impact = s(mh - m0)/m0, realized = s(p - mh)/m0.
 */
export function markouts(
  fill: Fill,
  prices: PriceSeries,
  horizons: number[],
  maxDeviationBps = 500,
): FillMarkouts | { fill: Fill; dropped: DropReason } {
  const m0 = prices.at(fill.blockTime);
  if (m0 === null) return { fill, dropped: "no_price" };
  const s = fill.side === "buy" ? 1 : -1;
  const effective = (s * (fill.price - m0) / m0) * BPS;
  if (Math.abs(effective) > maxDeviationBps) return { fill, dropped: "deviation" };
  const out: FillMarkouts["horizons"] = {};
  for (const h of horizons) {
    const mh = prices.at(fill.blockTime + h);
    if (mh === null) return { fill, dropped: "no_future_price" };
    out[h] = {
      markout: (s * (mh - fill.price) / fill.price) * BPS,
      impact: (s * (mh - m0) / m0) * BPS,
      realized: (s * (fill.price - mh) / m0) * BPS,
    };
  }
  return { fill, mid: m0, effective, horizons: out };
}

export function isDropped(x: FillMarkouts | { fill: Fill; dropped: DropReason }): x is { fill: Fill; dropped: DropReason } {
  return "dropped" in x;
}
