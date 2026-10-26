# Crown Macro → Portfolio Tracker

## Goal
Use the trade ideas from Nicholas Crown's "Crown Macro" newsletter as input to my own investing, filtered through my own rules (position sizing, asset classes, risk limits), and track everything with metrics. Claude flags and drafts; I approve and place every trade myself.

## Source: the newsletter
- Sender: `nicholas@newsletter.nicholascrown.com` (arrives in Gmail, ~200 emails since early Oct 2026, several per day).
- Paid tiers: Weekly ($49/mo, Monday conviction trades) and Daily Desk Access ($148/mo, live intraday alerts). I'm on the free list right now.
- **Free emails contain no actionable trades.** The "Active Positions" table (market / direction / structure / level) is locked behind "Unlock" links. Free emails only give themes and after-the-fact claims.
- Themes seen so far: AI/semiconductor bear trade, rotation from mega-cap concentration into market breadth, long crude oil (closed Fri 10/23 for a claimed +4.46%, re-entered Mon 10/26), plus notes on gold, bonds, and bank earnings.
- Claimed results: AI bear "+20% in a week," then "closed for 135%"; overall "62.7% P&L." His own disclaimer says these are **modeled** returns, at mid-market prices, gross of commissions, slippage, and taxes, and not from an actual account.

## My brokerages
- **Public**: has an official MCP server (`pip install publicdotcom-mcp-server`, repo github.com/publicdotcom/publicdotcom-mcp-server). It needs a Public API key and can place real orders, so keep tool approvals on and use read-only permissions if available. Never commit the API key.
- **Fidelity**: no API, so use CSV exports of positions from the Positions page.

## Plan
1. **Now (free):** log each call he describes (date, market, direction, his claimed result) and check it against real market data, to test his track record before paying.
2. **After subscribing:** parse the trade alerts (ticker, direction, structure, entry, stop, target, sizing) into a trade log. Apply my rules to mark each one act / skip / adjust, compare against my Public and Fidelity positions, and track his hit rate and P&L vs. mine.
3. **Automation:** a scheduled daily or weekly run scans Gmail, updates the log, and sends me a summary. Scheduled runs are hourly at best, so this fits the Weekly tier better than Daily Desk.

## Rules (to fill in)
- Max position size:
- Asset classes I trade (equities / options / futures / FX / crypto):
- Max total exposure to his ideas:
- Stop-loss policy:
