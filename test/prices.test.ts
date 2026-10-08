import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PriceSeries, fetchBinanceSeconds, klinesToPoints } from "../src/prices.js";

// Real Binance SOLUSDC 1s klines around mainnet block 454653033.
const rows = JSON.parse(readFileSync(new URL("./fixtures/binance-SOLUSDC-1s.json", import.meta.url), "utf8")) as unknown[][];

describe("PriceSeries", () => {
  it("reads real Binance klines", () => {
    const s = new PriceSeries(klinesToPoints(rows));
    expect(s.first).toBe(1791491579);
    expect(s.at(1791491579)).toBe(109.28);
    expect(s.at(s.first - 1)).toBeNull();
    expect(s.at(s.last + 1)).toBeNull();
  });

  it("carries the last close across gaps", () => {
    const s = new PriceSeries([[10, 1], [13, 2]]);
    expect([s.at(10), s.at(11), s.at(12), s.at(13)]).toEqual([1, 1, 1, 2]);
    expect(s.at(11.9)).toBe(1);
  });
});

describe("fetchBinanceSeconds", () => {
  it("pages 1000 seconds per request", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      const start = Number(new URL(url).searchParams.get("startTime"));
      return new Response(JSON.stringify([[start, "0", "0", "0", "5"]]));
    }) as unknown as typeof fetch;
    const s = await fetchBinanceSeconds("SOLUSDC", 0, 2500, fake);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("interval=1s");
    expect(s.at(2000)).toBe(5);
  });
});
