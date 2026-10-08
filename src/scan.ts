import type { Fill } from "./markouts.js";
import { pool, type Rpc } from "./rpc.js";
import { extractSwaps, orient, type ParsedTx } from "./swaps.js";
import { MINTS, VENUES, type Venue } from "./venues.js";

export interface ScanOptions {
  from: number;
  to: number;
  /** Keep one block in every N. 1 = every block. */
  every?: number;
  concurrency?: number;
  venues?: Venue[];
  baseMint?: string;
  quoteMint?: string;
  onBlock?: (slot: number, fills: number) => void;
}

/** Fills for one block's transactions. */
export function fillsFromBlock(txs: ParsedTx[], venues: Venue[] = VENUES, baseMint: string = MINTS.SOL, quoteMint: string = MINTS.USDC): Fill[] {
  const byProgram = new Map(venues.map((v) => [v.program, v]));
  const programs = new Set(byProgram.keys());
  const fills: Fill[] = [];
  txs.forEach((tx, i) => {
    for (const s of extractSwaps(tx, programs, i)) {
      const o = orient(s, baseMint, quoteMint);
      if (!o) continue;
      fills.push({
        signature: s.signature,
        slot: s.slot,
        txIndex: s.txIndex,
        blockTime: s.blockTime,
        venue: byProgram.get(s.program)!.name,
        program: s.program,
        trader: s.trader,
        ...o,
      });
    }
  });
  return fills;
}

/** Walks a slot range, fetching full blocks, and returns every fill on the chosen venues in chain order. */
export async function scan(rpc: Rpc, opts: ScanOptions): Promise<Fill[]> {
  const every = Math.max(1, opts.every ?? 1);
  const slots: number[] = [];
  // getBlocks returns at most 500k slots per call.
  for (let s = opts.from; s <= opts.to; s += 500_000) slots.push(...(await rpc.getBlocks(s, Math.min(opts.to, s + 499_999))));
  const picked = slots.filter((_, i) => i % every === 0);
  const perBlock = await pool(picked, opts.concurrency ?? 2, async (slot) => {
    const txs = await rpc.getBlock(slot);
    const fills = txs ? fillsFromBlock(txs, opts.venues, opts.baseMint, opts.quoteMint) : [];
    opts.onBlock?.(slot, fills.length);
    return fills;
  });
  return perBlock.flat();
}
