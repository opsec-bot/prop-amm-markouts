import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { klinesToPoints, PriceSeries } from "../src/prices.js";
import { fillsFromBlock } from "../src/scan.js";

const run = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

describe("cli report", () => {
  it("reports on real fills and real Binance prices", () => {
    const block = JSON.parse(readFileSync("test/fixtures/block-454653033.json", "utf8"));
    const txs = block.transactions.map(({ tx }: { tx: object }) => ({ ...tx, slot: block.slot, blockTime: block.blockTime }));
    const fills = fillsFromBlock(txs);
    const dir = mkdtempSync(join(tmpdir(), "markouts-"));
    writeFileSync(join(dir, "swaps.jsonl"), fills.map((f) => JSON.stringify(f)).join("\n") + "\n");
    const rows = JSON.parse(readFileSync("test/fixtures/binance-SOLUSDC-1s.json", "utf8"));
    writeFileSync(join(dir, "prices.json"), JSON.stringify(new PriceSeries(klinesToPoints(rows))));

    const report = JSON.parse(run("report", join(dir, "swaps.jsonl"), join(dir, "prices.json"), "--json"));
    expect(report.used).toBe(fills.length);
    // Every fill on the real block lands within 5 bps of Binance's close for that second.
    for (const row of report.rows) expect(Math.abs(row.effective.mean)).toBeLessThan(5);
    expect(run("report", join(dir, "swaps.jsonl"), join(dir, "prices.json"))).toContain("| BisonFi | all | 1 |");
  }, 30_000);
});
