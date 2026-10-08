import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rpc } from "../src/rpc.js";
import { fillsFromBlock, scan } from "../src/scan.js";

const block = JSON.parse(readFileSync(new URL("./fixtures/block-454653033.json", import.meta.url), "utf8")) as {
  slot: number;
  blockTime: number;
  transactions: { index: number; tx: unknown }[];
};

// Rebuild a full-length block so transaction positions match mainnet. Gaps are filled with empty failed txs.
const full: unknown[] = [];
for (const { index, tx } of block.transactions) full[index] = tx;
const filler = { meta: { err: "x" }, transaction: { signatures: ["x"], message: { accountKeys: [], instructions: [] } } };
for (let i = 0; i < full.length; i++) full[i] ??= filler;

function fakeRpc(slots: number[]) {
  const calls: string[] = [];
  const fetchFn = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push(body.method);
    let result: unknown = null;
    if (body.method === "getBlocks") result = slots.filter((s) => s >= body.params[0] && s <= body.params[1]);
    if (body.method === "getBlock") {
      expect(body.params[1].maxSupportedTransactionVersion).toBe(1);
      result = { blockTime: block.blockTime, transactions: full };
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  }) as unknown as typeof fetch;
  return { rpc: new Rpc("http://x", { fetch: fetchFn }), calls };
}

describe("scan", () => {
  it("turns a real block into SOL-USDC fills with mainnet tx positions", () => {
    const txs = full.map((t) => ({ ...(t as object), slot: block.slot, blockTime: block.blockTime })) as never;
    const fills = fillsFromBlock(txs);
    expect(fills.map((f) => f.venue).sort()).toEqual(["BisonFi", "Orca Whirlpools", "Orca Whirlpools", "Raydium CLMM", "Tessera V"].sort());
    const bison = fills.find((f) => f.venue === "BisonFi")!;
    expect(bison.txIndex).toBe(block.transactions.find(({ tx }) => (tx as { transaction: { signatures: string[] } }).transaction.signatures[0] === bison.signature)!.index);
  });

  it("samples one block in every N", async () => {
    const { rpc, calls } = fakeRpc([10, 11, 12, 13, 14]);
    const seen: number[] = [];
    const fills = await scan(rpc, { from: 10, to: 14, every: 2, onBlock: (s) => seen.push(s) });
    expect(seen.sort()).toEqual([10, 12, 14]);
    expect(calls.filter((c) => c === "getBlock")).toHaveLength(3);
    expect(fills.length).toBeGreaterThan(0);
  });
});
