#!/usr/bin/env -S npx tsx
import { readFileSync } from "node:fs";
import type { Fill } from "./markouts.js";
import { fetchBinanceSeconds, PriceSeries } from "./prices.js";
import { buildReport, DEFAULT_HORIZONS, toMarkdown } from "./report.js";
import { Rpc } from "./rpc.js";
import { scan } from "./scan.js";

const USAGE = `Usage:
  markouts scan --rpc <url> --from <slot> --to <slot> [--every N] [--concurrency N]   > swaps.jsonl
  markouts scan --rpc <url> --last <blocks> [--every N]                               > swaps.jsonl
  markouts prices [--pair SOLUSDC] [--horizons 1,5,15,30,60] <swaps.jsonl>             > prices.json
  markouts report <swaps.jsonl> <prices.json> [--horizons 1,5,15,30,60] [--json]       > report.md`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function bool(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

const readFills = (path: string): Fill[] =>
  readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Fill);
const horizonsOf = (s: string | undefined) => (s ? s.split(",").map(Number) : DEFAULT_HORIZONS);

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  if (cmd === "scan") {
    const url = flag(args, "--rpc") ?? process.env.SOLANA_RPC_URL;
    if (!url) return usage();
    const rpc = new Rpc(url);
    const last = flag(args, "--last");
    let from = Number(flag(args, "--from"));
    let to = Number(flag(args, "--to"));
    if (last) {
      to = await rpc.getSlot();
      from = to - Number(last) + 1;
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) return usage();
    const every = Number(flag(args, "--every") ?? 1);
    const concurrency = Number(flag(args, "--concurrency") ?? 2);
    let blocks = 0;
    let total = 0;
    const fills = await scan(rpc, {
      from,
      to,
      every,
      concurrency,
      onBlock: (_s, n) => {
        blocks++;
        total += n;
        process.stderr.write(`\rblocks ${blocks}, fills ${total}`);
      },
    });
    process.stderr.write("\n");
    fills.sort((a, b) => a.slot - b.slot || a.txIndex - b.txIndex);
    for (const f of fills) process.stdout.write(JSON.stringify(f) + "\n");
    return 0;
  }
  if (cmd === "prices") {
    const pair = flag(args, "--pair") ?? "SOLUSDC";
    const horizons = horizonsOf(flag(args, "--horizons"));
    if (!args[0]) return usage();
    const fills = readFills(args[0]);
    if (fills.length === 0) throw new Error("no fills");
    const times = fills.map((f) => f.blockTime);
    const series = await fetchBinanceSeconds(pair, Math.min(...times) - 5, Math.max(...times) + Math.max(...horizons) + 5);
    process.stdout.write(JSON.stringify(series) + "\n");
    return 0;
  }
  if (cmd === "report") {
    const horizons = horizonsOf(flag(args, "--horizons"));
    const json = bool(args, "--json");
    if (!args[0] || !args[1]) return usage();
    const prices = new PriceSeries(JSON.parse(readFileSync(args[1], "utf8")));
    const report = buildReport(readFills(args[0]), prices, horizons);
    process.stdout.write((json ? JSON.stringify(report, null, 2) : toMarkdown(report)) + "\n");
    return 0;
  }
  return usage();
}

function usage(): number {
  process.stderr.write(USAGE + "\n");
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
