# Deal Scout

This project scouts small businesses for sale near Port St. Lucie, FL, for a buyer to evaluate.

- `criteria.md`: what to look for (location, price, industries, financing). Edit it to change the search.
- `.claude/commands/deal-scout.md`: the full scouting procedure. Run it with `/deal-scout`.
- `reports/YYYY-MM-DD.md`: one digest per run.
- `data/seen-listings.csv`: every listing reported so far. It's used to avoid repeats and to track price changes.
- `scripts/`: Windows scripts that run the scout daily with Task Scheduler.

When the user asks about a listing or deal, check `reports/` and `data/seen-listings.csv` first.
When they ask you to change the criteria, edit `criteria.md`.
Never invent financial figures. Mark anything unverified or estimated.
