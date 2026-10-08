import { describe, expect, it } from "vitest";
import type { Fill } from "../src/markouts.js";
import { PriceSeries } from "../src/prices.js";
import { bucketLabel, buildReport, toMarkdown } from "../src/report.js";
import { gini, hhi, weightedStat } from "../src/stats.js";

describe("stats", () => {
  it("weightedStat matches the plain mean and stderr for equal weights", () => {
    const s = weightedStat([1, 2, 3, 4]);
    expect(s.mean).toBe(2.5);
    // sample sd = 1.29099, / sqrt(4)
    expect(s.stderr).toBeCloseTo(1.290994 / 2, 5);
  });

  it("weightedStat weights the mean", () => {
    expect(weightedStat([0, 10], [3, 1]).mean).toBe(2.5);
    expect(Number.isNaN(weightedStat([5]).stderr)).toBe(true);
  });

  it("hhi and gini", () => {
    expect(hhi([1, 1, 1, 1])).toBe(0.25);
    expect(hhi([1, 0, 0])).toBe(1);
    expect(gini([1, 1, 1])).toBeCloseTo(0, 9);
    expect(gini([0, 0, 0, 1])).toBeCloseTo(0.75, 9);
  });
});

describe("buildReport", () => {
  const prices = new PriceSeries([[0, 100], [200, 100]]);
  // Mid is flat at 100. Venue A always fills 1 bp over mid, venue B 5 bps over.
  const fills: Fill[] = [];
  let i = 0;
  for (const [venue, over] of [["A", 0.01], ["B", 0.05]] as const) {
    for (const quote of [50, 500, 5000, 5000]) {
      fills.push({ signature: `s${i}`, slot: i, txIndex: 0, blockTime: 10 + i, venue, program: venue, trader: "t", side: i % 2 ? "sell" : "buy", base: quote / 100, quote, price: i % 2 ? 100 - over : 100 + over });
      i++;
    }
  }
  fills.push({ ...fills[0]!, signature: "late", blockTime: 190 }); // no price 60s later

  const r = buildReport(fills, prices);

  it("counts used and dropped fills", () => {
    expect(r.used).toBe(8);
    expect(r.dropped.no_future_price).toBe(1);
  });

  it("gives effective spread per venue", () => {
    const a = r.rows.find((x) => x.venue === "A" && x.size === "all")!;
    const b = r.rows.find((x) => x.venue === "B" && x.size === "all")!;
    expect(a.effective.mean).toBeCloseTo(1, 6);
    expect(b.effective.mean).toBeCloseTo(5, 6);
    expect(a.notional).toBe(10550);
    // Flat mid: takers lose exactly the spread, nobody is toxic.
    expect(a.markout[60]!.mean).toBeCloseTo(-1, 3);
    expect(a.toxicShare).toBe(0);
  });

  it("splits by size bucket", () => {
    expect(bucketLabel(50)).toBe("0-100");
    expect(bucketLabel(500)).toBe("100-1k");
    expect(bucketLabel(250_000)).toBe("100k+");
    const sizes = r.rows.filter((x) => x.venue === "A").map((x) => x.size);
    expect(sizes).toEqual(["all", "0-100", "100-1k", "1k-10k"]);
  });

  it("renders Markdown", () => {
    const md = toMarkdown(r);
    expect(md).toContain("| A | all | 4 |");
    expect(md).toContain("Taker markout by horizon");
  });
});
