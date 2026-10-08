# Spec: prop-amm-markouts v1

## Goal
An open, repeatable measure of execution quality on Solana's proprietary AMMs (HumidiFi, SolFi, BisonFi, Tessera,
ZeroFi, Obric), with the open AMMs (Orca, Raydium CLMM, Meteora DLMM) as a baseline. For every swap: what did the
taker pay against the market mid, and where did the market go right after?

Prop AMMs are closed source. Their makers track markouts privately. Nobody publishes them. This tool does, from public
data only: Solana blocks and Binance's public 1 second candles.

## Non-goals (v1)
- Pairs other than one base/quote at a time (default SOL/USDC). Any pair works if Binance lists it.
- Sub-second timing. Solana `blockTime` has 1 second resolution, so horizons start at 1 second.
- Simulating quotes. LimeChain's `pmm-sim` already does that.

## Inputs
1. **Swaps**, read from full blocks (`getBlock`, jsonParsed, transaction version 1). A swap is the pair of token
   transfers a pool program makes in its CPIs: what the trader paid in, what came back. No IDL needed, so closed
   programs parse the same as open ones. Instructions with fewer than two transfers (quote updates) are skipped.
2. **Reference mid**: Binance 1 second close for the pair, at the swap's `blockTime`, and at `blockTime + h` for each
   horizon `h`.

## Venues
Program IDs were checked by reading the owner of a known pool account on mainnet (pools taken from LimeChain's
`pmm-sim` config).

| Venue | Program |
|---|---|
| HumidiFi | `9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp` |
| SolFi V2 | `SV2EYYJyRz2YhfXwXnhNAevDEui5Q6yrfyo13WtupPF` |
| BisonFi | `BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi` |
| Tessera V | `TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH` |
| ZeroFi | `ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY` |
| Obric V2 | `obriQD1zbpyLz95G5n7nJe6a4DPjpFwa5XYPoNm113y` |
| Orca Whirlpools | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` |
| Raydium CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |

## Math
For a swap with side `s` (+1 if the taker bought base, -1 if sold), execution price `p` (quote per base), mid `m0` at
the swap and `m_h` at horizon `h`, all in basis points:

| Measure | Formula | Reading |
|---|---|---|
| Effective spread | `E = s (p - m0) / m0` | What the taker paid over mid. Positive is a cost. |
| Taker markout | `M_h = s (m_h - p) / p` | Taker profit after `h`. Positive means the maker got picked off. |
| Price impact | `A_h = s (m_h - m0) / m0` | How far the market moved the taker's way. The adverse selection the maker faced. |
| Realized spread | `R_h = s (p - m_h) / m0` | What the maker kept after `h`. Close to `E - A_h`. |

Maker markout is `-M_h`. Default horizons: 1, 5, 15, 30 and 60 seconds.

Aggregates per venue and per size bucket (quote notional: under 100, 100 to 1k, 1k to 10k, 10k to 100k, 100k and up):
- Notional weighted mean of each measure, with a standard error from the effective sample size
  `n_eff = (sum w)^2 / sum w^2` and a 95% interval of mean +- 1.96 stderr.
- Toxic share: notional share of swaps with `M_60 > 0`.
- Count and total notional.

Swaps whose reference price is missing, or whose execution price is more than `maxDeviationBps` (default 500) from
mid, are dropped and counted as such. That catches misparsed swaps and dead pools without hiding them.

## Output
- `swaps.jsonl`: one oriented swap per line (signature, slot, txIndex, venue, side, base, quote, price, trader).
- `report.json` and a Markdown table per horizon, sorted by notional.

## CLI
```
markouts scan --rpc <url> --from <slot> --to <slot> [--every N] > swaps.jsonl
markouts prices --pair SOLUSDC swaps.jsonl > prices.json
markouts report swaps.jsonl prices.json [--horizons 1,5,15,30,60] > report.md
```

## Known weaknesses
- 1 second clock. A swap and its horizon share the same coarse second grid, so 1 second markouts are noisy.
- Binance is one venue. When Solana leads Binance (it sometimes does for SOL), the reference lags.
- Router trades where no trader-side account signs fall back to "first transfer is the payment". Correct for every
  pool we checked, but not guaranteed.
- Some prop AMMs give better quotes to whitelisted callers, so averages mix two kinds of flow.
