# Deal Scout

A Claude Code agent that searches business-for-sale sites every morning. It finds listings near
Port St. Lucie, FL, at $250K–$1M, scores each one, saves a report, and emails you the digest.

## One-time setup (Windows)

1. **Install Claude Code** and sign in with your claude.ai account:
   ```powershell
   npm install -g @anthropic-ai/claude-code
   claude    # first run walks you through sign-in; type /exit when done
   ```
2. **Get the project.** It lives in the `deal-scout/` folder of the Home-Scheduler repo. Clone the repo and open that folder, or copy the folder into a repo of its own:
   ```powershell
   git clone https://github.com/connormcl123/home-scheduler.git
   cd home-scheduler\deal-scout
   ```
3. **Connect Gmail** at https://claude.ai/customize/connectors if it isn't connected already.
   Claude Code signed in with your claude.ai account picks up these connectors.
   Check it: run `claude`, type `/mcp`, and look for Gmail.
   If Gmail's tools show up under a name other than `claude_ai_Gmail`, update the
   last entry in `.claude/settings.json` to match.
4. **Test one run:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\run-scout.ps1
   ```
   Then check `reports\` for today's digest, your inbox for the email, and `logs\` for the run output.
5. **Schedule it daily** (default time 6:49 AM):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install-schedule.ps1
   ```
   The PC needs to be on, or asleep and allowed to wake. If it was off at run time,
   the scout runs as soon as the PC is back on.

## Use it from your phone (Remote Control)

In the repo folder, run:
```powershell
claude remote-control
```
The session then appears in the Claude app on your phone and on claude.ai/code. From there you can ask
"run /deal-scout now", "tell me more about the electrical contractor in today's report",
or "add car washes to the skip list". The session runs on your PC, with your files and network.

## Change what it looks for

Edit `criteria.md`, or ask Claude to edit it. Each run reads it fresh.

## Files

| Path | What it is |
|---|---|
| `criteria.md` | Location, price, industries, financing, delivery email |
| `.claude/commands/deal-scout.md` | The scouting procedure (`/deal-scout`) |
| `reports/` | One dated digest per run |
| `data/seen-listings.csv` | Every listing reported so far; prevents repeats and tracks price drops |
| `scripts/` | Windows run script and Task Scheduler installer |
