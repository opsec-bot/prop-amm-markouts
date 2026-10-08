# prop-amm-markouts

Open markouts for Solana's prop AMMs.

Most SOL-USDC volume on Solana now trades against proprietary AMMs (HumidiFi, BisonFi, SolFi, Tessera, ZeroFi,
Obric). Their code is closed and their makers keep their fill quality numbers to themselves. This tool measures it from
public data: it reads swaps straight out of Solana blocks and compares each fill with Binance's 1 second price, right
at the fill and 1 to 60 seconds after.

Open AMMs (Orca, Raydium CLMM, Meteora DLMM) are measured the same way as a baseline.

## What it measures
For each fill, in basis points:

| Measure | Formula | Meaning |
|---|---|---|
| Effective spread | `s (p - m0) / m0` | What the taker paid over mid. Positive is a cost. |
| Taker markout | `s (m_h - p) / p` | Taker profit `h` seconds later. Positive means the maker was picked off. |
| Price impact | `s (m_h - m0) / m0` | How far the market moved the taker's way. |
| Realized spread | `s (p - m_h) / m0` | What the maker kept after `h` seconds. |

`s` is +1 for a buy and -1 for a sell, `p` the fill price, `m0` the Binance mid at the fill, `m_h` the mid `h` seconds
later. Results are notional weighted per venue and size bucket, with 95% intervals. The full method is in
[docs/SPEC.md](docs/SPEC.md) and the background in [docs/RESEARCH.md](docs/RESEARCH.md).

## How swaps are read without an IDL
Every pool, open or closed, moves tokens through the SPL Token program. The parser reads the transfers one CPI level
below each pool instruction: what the trader paid in and what came back. Prop AMM quote updates have no transfers and
are skipped. On a real block in the tests, fills from four venues all land within 1.6 bps of Binance's close for the
same second.

## Try it
Needs Node 22 or newer.

```sh
npm install
npm test

# 20 recent blocks, one every 20 slots
npx tsx src/cli.ts scan --rpc https://api.mainnet-beta.solana.com --last 400 --every 20 --concurrency 1 > swaps.jsonl
npx tsx src/cli.ts prices swaps.jsonl > prices.json
npx tsx src/cli.ts report swaps.jsonl prices.json
```

Each full block is about 8 MB, so the public RPC is fine for a demo. For a day of data use your own RPC and a larger
`--concurrency`. [docs/sample-2026-10-08.md](docs/sample-2026-10-08.md) shows the output of the run above. 156 fills
is far too few to rank venues; it shows the format.

## Venues
Program IDs were confirmed on mainnet by reading the owner of a known pool account. See `src/venues.ts`. To add a venue,
add its program ID there. Nothing else is venue specific.

## Use it as a library
```ts
import { Rpc, scan, fetchBinanceSeconds, buildReport, toMarkdown } from "prop-amm-markouts";

const fills = await scan(new Rpc(url), { from, to, every: 10 });
const prices = await fetchBinanceSeconds("SOLUSDC", fills[0].blockTime - 5, fills.at(-1).blockTime + 65);
console.log(toMarkdown(buildReport(fills, prices)));
```

## Limits
- Solana's `blockTime` is whole seconds, so 1 second markouts are noisy.
- Binance is the only reference. When Solana leads Binance, effective spreads can look negative.
- Some prop AMMs quote better to whitelisted callers, so a venue's average mixes two kinds of flow.
- SOL-USDC by default. Pass other mints to `scan` and another Binance symbol to `prices` for other pairs.

## License
MIT
