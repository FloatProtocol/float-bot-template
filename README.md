# Float Protocol Arbitrage Bot

Contains the rough skeleton for discovering, evaluating and executing arbitrage opportunities in Float Protocol Auctions.

## Future Work
1. Flashbot searcher integration - For more information, see the [Flashbots Searcher FAQ](https://github.com/flashbots/pm/blob/main/guides/searcher-onboarding.md)

## Usage

```
# Install dependencies
yarn

# Check for the last auction
yarn hardhat --network mainnet last-auction

# Run monitoring script to check profit.
START_BLOCK=<AUCTION_START> yarn hardhat run scripts/monitor.ts
```
