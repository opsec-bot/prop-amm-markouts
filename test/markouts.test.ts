import { describe, expect, it } from "vitest";
import { isDropped, markouts, type Fill } from "../src/markouts.js";
import { PriceSeries } from "../src/prices.js";

const fill = (over: Partial<Fill> = {}): Fill => ({
  signature: "s",
  slot: 1,
  txIndex: 0,
  blockTime: 100,
  venue: "V",
  program: "P",
  trader: "T",
  side: "buy",
  base: 1,
  quote: 100.1,
  price: 100.1,
  ...over,
});

// Mid 100 at t=100, 101 at t=105, 99 at t=160.
const prices = new PriceSeries([[100, 100], [105, 101], [160, 99]]);

describe("markouts", () => {
  it("computes the four measures for a buy", () => {
    const r = markouts(fill(), prices, [5, 60]);
    if (isDropped(r)) throw new Error("dropped");
    expect(r.mid).toBe(100);
    expect(r.effective).toBeCloseTo(10, 9); // paid 0.1 over 100 = 10 bps
    expect(r.horizons[5]!.markout).toBeCloseTo(((101 - 100.1) / 100.1) * 1e4, 9); // taker up ~89.9 bps
    expect(r.horizons[5]!.impact).toBeCloseTo(100, 9);
    expect(r.horizons[5]!.realized).toBeCloseTo(-90, 9); // maker lost 90 bps
    expect(r.horizons[60]!.impact).toBeCloseTo(-100, 9);
  });

  it("flips signs for a sell", () => {
    const r = markouts(fill({ side: "sell", price: 99.9, quote: 99.9 }), prices, [5]);
    if (isDropped(r)) throw new Error("dropped");
    expect(r.effective).toBeCloseTo(10, 9); // sold 0.1 under mid: still a 10 bps cost
    expect(r.horizons[5]!.impact).toBeCloseTo(-100, 9); // price went against the seller
  });

  it("keeps realized = effective - impact up to the p vs m0 scaling", () => {
    const r = markouts(fill({ price: 100.03 }), prices, [5]);
    if (isDropped(r)) throw new Error("dropped");
    expect(r.horizons[5]!.realized).toBeCloseTo(r.effective - r.horizons[5]!.impact, 9);
  });

  it("drops fills with no price, no future price, or a price far from mid", () => {
    expect(markouts(fill({ blockTime: 50 }), prices, [5])).toMatchObject({ dropped: "no_price" });
    expect(markouts(fill({ blockTime: 158 }), prices, [5])).toMatchObject({ dropped: "no_future_price" });
    expect(markouts(fill({ price: 110 }), prices, [5])).toMatchObject({ dropped: "deviation" });
  });
});
