# Research notes

Read October 2026.

## What prop AMMs are
Prop AMMs are on-chain pools where one market maker sets the price with frequent cheap oracle-style updates instead
of a public curve. On Solana they now carry most SOL-USDC volume. Their programs are closed and obfuscated.

- Helius, [Solana's Proprietary AMM Revolution](https://www.helius.dev/blog/solanas-proprietary-amm-revolution)
- Solana Compass, [How HumidiFi became Solana's largest prop AMM](https://solanacompass.com/learn/Lightspeed/how-humidifi-became-solanas-largest-prop-amm):
  the HumidiFi team says they judge profitability by markouts and pool fund growth. Those numbers are internal.
- Step Data, [BisonFi ends HumidiFi's dominance](https://stepdata.substack.com/p/prop-amms-on-solana-bisonfi-ends):
  BisonFi passed HumidiFi in daily prop AMM volume. Shares move fast, which is a reason for a live tool over a report.

## Existing measurement
- Chorus One, [Market Making, propAMMs, and Solana Execution Quality](https://chorus.one/reports-research/market-making-propamms-and-solana-execution-quality-landscape):
  effective spread by trade size per venue. HumidiFi quoted about 0.4 to 1.6 bps on SOL-USDC across most sizes.
  This is a one-time report on quotes, not markouts on fills.
- LimeChain, [pmm-sim](https://github.com/LimeChain/pmm-sim): simulates swaps against prop AMM programs in LiteSVM
  to compare quotes. It notes some prop AMMs quote better to whitelisted callers. It does not measure what happened
  after a fill. Its config was our source for pool addresses; the program IDs we list come from reading those pools'
  owners on mainnet.
- Quote refresh speed: one analysis cites HumidiFi updating quotes up to 74 times per second, which is how prop AMMs
  limit adverse selection. Markouts show whether that works.

## The measures
Effective spread, realized spread and price impact are the standard decomposition from equity market microstructure
(Huang and Stoll 1996, and the SEC Rule 605 execution quality statistics). A markout is the same idea seen from the
maker: how much a fill was worth some seconds later. Notional weighting answers "per dollar traded", which is what
a router or LP cares about.

## Why this is buildable from public data
- Swaps: every pool, open or closed, moves tokens through the SPL Token program. Reading the transfers one CPI level
  below the pool instruction gives the fill without decoding the pool. Checked on mainnet block 454653033: SOL-USDC
  fills on BisonFi, Tessera, Orca and Raydium CLMM parse to prices within 2 bps of Binance's close for the same second.
- Prices: Binance publishes 1 second klines at `data-api.binance.vision` with no key, reachable from the US.
- Mainnet now has version 1 transactions, so every RPC request must allow `maxSupportedTransactionVersion: 1`.
